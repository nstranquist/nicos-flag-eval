// GET /api/audit?key=<key>&limit=50
// Returns audit_events newest-first.
//
// Flag values carry no PII, so the event stream itself is a public read. The
// `actor` column does not: it holds operator email addresses, and `reason`
// holds free-text change rationale. Those are attributed only to authenticated
// callers — an anonymous read gets the same events with attribution omitted.

import type {} from "@cloudflare/workers-types";
import { db, errorCode, json, actorFromRequest, type Env } from "../_lib/turso";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const viewer = await actorFromRequest(request, env);
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 500);

  const c = db(env);
  if (!c) return json({ ok: true, events: [], note: "Turso unbound" });

  try {
    const sql = key
      ? `SELECT id, ts, action, scope, env, key, value, prev, actor, reason
           FROM audit_events
          WHERE key = ?
          ORDER BY ts DESC
          LIMIT ?`
      : `SELECT id, ts, action, scope, env, key, value, prev, actor, reason
           FROM audit_events
          ORDER BY ts DESC
          LIMIT ?`;
    const args = key ? [key, limit] : [limit];
    const r = await c.execute({ sql, args });
    const events = r.rows.map((row) => ({
      id: row.id as number,
      ts: row.ts as string,
      action: row.action as string,
      scope: row.scope as string,
      env: row.env as string,
      key: row.key as string,
      value: row.value as string | null,
      prev: row.prev as string | null,
      ...(viewer
        ? { actor: row.actor as string, reason: row.reason as string | null }
        : {}),
    }));
    return json({ ok: true, events });
  } catch (e: any) {
    // Never echo the driver error: it can carry the Turso URL and connection
    // details. Log it for the operator, return an opaque failure.
    console.error("[flag-eval-demo] audit query failed", errorCode(e));
    return json({ ok: false, error: "query-failed" }, 500);
  }
};
