// GET /api/force-lists?flagKey=<key>&env=<env>
// Aggregates Turso `force-include` / `force-exclude` scope rows for one
// flag at one env. Key encoding convention: <flag-key>:<user-id>. Writes
// use the existing POST/DELETE /api/overrides/:key endpoints with the
// matching scope param — no new write endpoint is required.
//
// Read-side note: this surface does NOT merge with the manifest's
// force_include/force_exclude blocks (those ship in flags.runtime.json
// and represent developer-pinned overrides). Callers wanting the union
// should layer the two themselves.
//
// `/api/evaluate` already honors these Turso rows at resolve time —
// see evaluate.ts's force-exclude/force-include tier between
// cloud-override and the engine eval (lookup keyed on the same
// <flag-key>:<user-id> encoding this endpoint reads).

import { actorFromRequest, db, errorCode, json, type Env } from "../_lib/turso";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const viewer = await actorFromRequest(request, env);
  const url = new URL(request.url);
  const flagKey = url.searchParams.get("flagKey");
  const envName = url.searchParams.get("env") ?? "default";
  if (!flagKey) return json({ ok: false, error: "missing flagKey" }, 400);

  const c = db(env);
  if (!c) {
    return json({
      ok: true, flagKey, env: envName, include: {}, exclude: [], meta: {},
      note: "Turso unbound — set TURSO_URL + TURSO_AUTH_TOKEN to persist",
    });
  }

  try {
    const r = await c.execute({
      sql: `SELECT scope, key, value, actor, reason, updated_at
              FROM overrides
             WHERE scope IN ('force-include', 'force-exclude')
               AND env = ?
               AND key LIKE ?
             ORDER BY scope, key`,
      args: [envName, `${flagKey}:%`],
    });
    const include: Record<string, unknown> = {};
    const exclude: string[] = [];
    const meta: Record<string, { actor: string; reason: string | null; updated_at: string; scope: string }> = {};
    const prefixLen = flagKey.length + 1;
    for (const row of r.rows) {
      const fullKey = row.key as string;
      if (!fullKey.startsWith(`${flagKey}:`)) continue;
      const userId = fullKey.slice(prefixLen);
      const scope = row.scope as string;
      if (scope === "force-include") {
        const raw = row.value as string;
        try { include[userId] = JSON.parse(raw); } catch { include[userId] = raw; }
      } else if (scope === "force-exclude") {
        exclude.push(userId);
      }
      meta[userId] = {
        scope,
        actor: (row.actor as string) ?? "",
        reason: (row.reason as string | null) ?? null,
        updated_at: (row.updated_at as string) ?? "",
      };
    }
    return json({ ok: true, flagKey, env: envName, include, exclude, ...(viewer ? { meta } : {}) });
  } catch (e: any) {
    console.error("force list query failed", errorCode(e));
    return json({ ok: false, error: "query-failed" }, 500);
  }
};
