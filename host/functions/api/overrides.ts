// GET /api/overrides?env=<env>
// List override values for an environment. This is a public read because flag
// values carry no PII (consumers gate at the rule layer).
//
// The `meta` block does carry PII (`actor` is an operator email, `reason` is
// free-text rationale), so it is returned only to authenticated callers.
// Anonymous readers get the override values without attribution.
//
// Writes live at functions/api/overrides/[key].ts (POST + DELETE). The
// literal path /api/overrides/promote is owned by overrides/promote.ts
// (KEP-008) and wins over the dynamic [key] match per Pages routing.

import type {} from "@cloudflare/workers-types";
import { db, errorCode, json, actorFromRequest, type Env } from "../_lib/turso.ts";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const viewer = await actorFromRequest(request, env);
  const url = new URL(request.url);
  const envName = url.searchParams.get("env") ?? "default";

  const c = db(env);
  if (!c) {
    return json({ ok: true, env: envName, overrides: {}, note: "Turso unbound" });
  }

  try {
    const r = await c.execute({
      sql: `SELECT key, value, actor, reason, updated_at
              FROM overrides
             WHERE scope = 'cloud' AND env = ?
             ORDER BY key`,
      args: [envName],
    });
    const overrides: Record<string, unknown> = {};
    const meta: Record<string, { actor: string; reason: string | null; updated_at: string }> = {};
    for (const row of r.rows) {
      const k = row.key as string;
      const v = row.value as string;
      try {
        overrides[k] = JSON.parse(v);
      } catch {
        overrides[k] = v;
      }
      meta[k] = {
        actor: (row.actor as string) ?? "",
        reason: (row.reason as string | null) ?? null,
        updated_at: (row.updated_at as string) ?? "",
      };
    }
    return json({ ok: true, env: envName, overrides, ...(viewer ? { meta } : {}) });
  } catch (e: any) {
    // Never echo the driver error: it can carry the Turso URL and connection
    // details. Log it for the operator, return an opaque failure.
    console.error("[flag-eval-demo] overrides query failed", errorCode(e));
    return json({ ok: false, error: "query-failed" }, 500);
  }
};
