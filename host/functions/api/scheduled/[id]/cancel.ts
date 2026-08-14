// Cancel one pending scheduled change and write an audit event.

import { actorFromRequest, db, errorCode, json, nowISO, type Env } from "../../../_lib/turso";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || !["admin", "editor"].includes(actor.role)) return json({ ok: false, error: "forbidden" }, 403);
  const id = String((params as { id?: string }).id ?? "");
  if (!/^\d+$/u.test(id)) return json({ ok: false, error: "missing id" }, 400);
  const client = db(env);
  if (!client) return json({ ok: false, error: "Turso is not configured" }, 503);

  const pending = await client.execute({
    sql: `SELECT env, key, value, reason FROM scheduled_changes WHERE id = ? AND status = 'pending'`,
    args: [Number(id)],
  });
  const row = pending.rows[0] as Record<string, unknown> | undefined;
  if (!row) return json({ ok: false, error: "pending schedule not found" }, 404);
  const ts = nowISO();
  const reason = row.reason == null ? null : String(row.reason);
  const tx = await client.transaction("write");
  try {
    const update = await tx.execute({
      sql: `UPDATE scheduled_changes SET status = 'cancelled' WHERE id = ? AND status = 'pending'`,
      args: [Number(id)],
    });
    if (update.rowsAffected !== 1) {
      await tx.rollback();
      return json({ ok: false, error: "schedule changed concurrently" }, 409);
    }
    await tx.execute({
      sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
            VALUES (?, 'schedule-cancelled', 'cloud', ?, ?, NULL, ?, ?, ?)`,
      args: [ts, String(row.env), String(row.key), String(row.value), actor.email, reason],
    });
    await tx.commit();
    return json({ ok: true, id: Number(id), status: "cancelled", actor: actor.email });
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    console.error("schedule cancel failed", errorCode(error));
    return json({ ok: false, error: "schedule cancel failed" }, 500);
  } finally {
    tx.close();
  }
};
