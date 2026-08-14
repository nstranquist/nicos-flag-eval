// POST /api/overrides/promote { key, from, to, reason? }

import { db, actorFromRequest, errorCode, json, nowISO, type Env } from "../../_lib/turso";
import { isRegisteredFlag, parseStoredValue } from "../../_lib/flag-contract";
import { publishLiveStreamEvent } from "../../_lib/stream-publish";

type Body = { key?: string; from?: string; to?: string; reason?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || actor.role === "viewer") return json({ ok: false, error: "forbidden" }, 403);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const { key, from, to } = body;
  if (!key || !from || !to) return json({ ok: false, error: "missing key/from/to" }, 400);
  if (!isRegisteredFlag(key)) return json({ ok: false, error: "unknown flag" }, 404);
  if (from === to) return json({ ok: false, error: "from and to must differ" }, 400);

  const client = db(env);
  if (!client) return json({ ok: true, key, from, to, actor: actor.email, persisted: false, note: "Turso is not configured" });
  const ts = nowISO();
  const reason = body.reason ? String(body.reason) : `promote from ${from}`;
  const tx = await client.transaction("write");
  try {
    const source = await tx.execute({
      sql: `SELECT value FROM overrides WHERE scope = 'cloud' AND env = ? AND key = ?`,
      args: [from, key],
    });
    const srcVal = source.rows[0]?.value as string | undefined;
    if (srcVal === undefined) {
      await tx.rollback();
      return json({ ok: false, error: `no override at env=${from} for key=${key}` }, 404);
    }
    const destination = await tx.execute({
      sql: `SELECT value FROM overrides WHERE scope = 'cloud' AND env = ? AND key = ?`,
      args: [to, key],
    });
    const destPrev = destination.rows[0]?.value as string | undefined;
    await tx.execute({
      sql: `INSERT INTO overrides (scope, env, key, value, actor, reason, updated_at)
            VALUES ('cloud', ?, ?, ?, ?, ?, ?)
            ON CONFLICT (scope, env, key) DO UPDATE SET
              value = excluded.value, actor = excluded.actor,
              reason = excluded.reason, updated_at = excluded.updated_at`,
      args: [to, key, srcVal, actor.email, reason, ts],
    });
    const audit = await tx.execute({
      sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
            VALUES (?, 'promote', 'cloud', ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [ts, to, key, srcVal, destPrev ?? null, actor.email, reason],
    });
    await tx.commit();
    const auditId = Number(audit.rows[0]?.id);
    if (Number.isSafeInteger(auditId)) {
      await publishLiveStreamEvent(env, { id: auditId, action: "promote", scope: "cloud", env: to, key, value: parseStoredValue(srcVal), prev: destPrev == null ? null : parseStoredValue(destPrev), ts });
    }
    return json({ ok: true, key, from, to, value: parseStoredValue(srcVal), actor: actor.email, prev_at_dest: destPrev ? parseStoredValue(destPrev) : null, persisted: true });
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    console.error("override promotion failed", errorCode(error));
    return json({ ok: false, error: "write-failed" }, 500);
  } finally {
    tx.close();
  }
};
