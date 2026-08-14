// Approve or reject one pending change request.

import { actorFromRequest, db, errorCode, json, nowISO, type Env } from "../../../_lib/turso";
import { parseStoredValue } from "../../../_lib/flag-contract";
import { publishLiveStreamEvent } from "../../../_lib/stream-publish";

type RequestRow = Record<string, unknown>;

function decode(row: RequestRow) {
  return {
    id: Number(row.id),
    env: String(row.env),
    key: String(row.key),
    value: parseStoredValue(row.value),
    reason: row.reason ?? null,
    proposer: String(row.proposer),
    approver: row.approver ?? null,
    status: String(row.status),
    created_at: String(row.created_at),
    decided_at: row.decided_at ?? null,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || actor.role !== "admin") return json({ ok: false, error: "admin required" }, 403);
  const id = String((params as { id?: string }).id ?? "");
  const decision = String((params as { decision?: string }).decision ?? "");
  if (!/^\d+$/u.test(id) || !["approve", "reject"].includes(decision)) {
    return json({ ok: false, error: "bad path" }, 400);
  }

  const client = db(env);
  if (!client) return json({ ok: false, error: "Turso is not configured" }, 503);
  const requestResult = await client.execute({
    sql: `SELECT id, env, key, value, reason, proposer, approver, status, created_at, decided_at
          FROM change_requests WHERE id = ?`,
    args: [Number(id)],
  });
  const row = requestResult.rows[0] as RequestRow | undefined;
  if (!row) return json({ ok: false, error: "request not found" }, 404);
  if (String(row.status) !== "pending") return json({ ok: false, error: "request is not pending" }, 409);

  const decidedAt = nowISO();
  const reason = row.reason == null ? null : String(row.reason);
  let auditId: number | undefined;
  let publishedValue: unknown;
  const tx = await client.transaction("write");
  try {
    const update = await tx.execute({
      sql: `UPDATE change_requests SET status = ?, approver = ?, decided_at = ?
            WHERE id = ? AND status = 'pending'`,
      args: [decision === "approve" ? "approved" : "rejected", actor.email, decidedAt, Number(id)],
    });
    if (update.rowsAffected !== 1) {
      await tx.rollback();
      return json({ ok: false, error: "request changed concurrently" }, 409);
    }

    if (decision === "approve") {
      const encoded = String(row.value);
      await tx.execute({
        sql: `INSERT INTO overrides (scope, env, key, value, actor, reason, updated_at)
              VALUES ('cloud', ?, ?, ?, ?, ?, ?)
              ON CONFLICT (scope, env, key) DO UPDATE SET
                value = excluded.value, actor = excluded.actor,
                reason = excluded.reason, updated_at = excluded.updated_at`,
        args: [String(row.env), String(row.key), encoded, actor.email, reason, decidedAt],
      });
      const audit = await tx.execute({
        sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
              VALUES (?, 'request-approved', 'cloud', ?, ?, ?, NULL, ?, ?)
              RETURNING id`,
        args: [decidedAt, String(row.env), String(row.key), encoded, actor.email, reason],
      });
      auditId = Number(audit.rows[0]?.id);
      publishedValue = parseStoredValue(encoded);
    } else {
      await tx.execute({
        sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
              VALUES (?, 'request-rejected', 'cloud', ?, ?, NULL, NULL, ?, ?)`,
        args: [decidedAt, String(row.env), String(row.key), actor.email, reason],
      });
    }
    await tx.commit();
    if (decision === "approve" && auditId !== undefined && Number.isSafeInteger(auditId)) {
      await publishLiveStreamEvent(env, {
        id: auditId,
        action: "request-approved",
        scope: "cloud",
        env: String(row.env),
        key: String(row.key),
        value: publishedValue,
        ts: decidedAt,
      });
    }
    const finalResult = decode({ ...row, status: decision === "approve" ? "approved" : "rejected", approver: actor.email, decided_at: decidedAt });
    return json({ ok: true, request: finalResult });
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    console.error("request decision failed", errorCode(error));
    return json({ ok: false, error: "request decision failed" }, 500);
  } finally {
    tx.close();
  }
};
