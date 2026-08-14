// Apply due scheduled changes. The cron Worker calls this endpoint.

import { db, errorCode, json, nowISO, type Env } from "../_lib/turso";
import { parseStoredValue } from "../_lib/flag-contract";
import { publishLiveStreamEvent } from "../_lib/stream-publish";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = request.headers.get("x-cron-secret");
  if (!env.PAGES_INTERNAL_SECRET || secret !== env.PAGES_INTERNAL_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const client = db(env);
  if (!client) return json({ ok: false, error: "Turso is not configured" }, 503);

  const now = nowISO();
  const pending = await client.execute({
    sql: `SELECT id, env, key, value, created_by, reason
          FROM scheduled_changes WHERE status = 'pending' AND fire_at <= ?
          ORDER BY fire_at ASC LIMIT 100`,
    args: [now],
  });
  const fired: number[] = [];
  for (const row of pending.rows as Array<Record<string, unknown>>) {
    const id = Number(row.id);
    const reason = row.reason == null ? null : String(row.reason);
    const tx = await client.transaction("write");
    try {
      const update = await tx.execute({
        sql: `UPDATE scheduled_changes SET status = 'fired', fired_at = ?
              WHERE id = ? AND status = 'pending'`,
        args: [now, id],
      });
      if (update.rowsAffected !== 1) {
        await tx.rollback();
        continue;
      }
      await tx.execute({
        sql: `INSERT INTO overrides (scope, env, key, value, actor, reason, updated_at)
              VALUES ('cloud', ?, ?, ?, ?, ?, ?)
              ON CONFLICT (scope, env, key) DO UPDATE SET
                value = excluded.value, actor = excluded.actor,
                reason = excluded.reason, updated_at = excluded.updated_at`,
        args: [String(row.env), String(row.key), String(row.value), String(row.created_by), reason, now],
      });
      const audit = await tx.execute({
        sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
              VALUES (?, 'schedule-fired', 'cloud', ?, ?, ?, NULL, ?, ?)
              RETURNING id`,
        args: [now, String(row.env), String(row.key), String(row.value), String(row.created_by), reason],
      });
      const auditId = Number(audit.rows[0]?.id);
      await tx.commit();
      fired.push(id);
      if (Number.isSafeInteger(auditId)) {
        await publishLiveStreamEvent(env, {
          id: auditId,
          action: "schedule-fired",
          scope: "cloud",
          env: String(row.env),
          key: String(row.key),
          value: parseStoredValue(String(row.value)),
          ts: now,
        });
      }
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      console.error(`schedule fire failed for ${id}`, errorCode(error));
    } finally {
      tx.close();
    }
  }
  return json({ ok: true, fired: fired.length, ids: fired, evaluated_at: now });
};
