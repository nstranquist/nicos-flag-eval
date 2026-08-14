// Change-request workflow.

import { actorFromRequest, db, errorCode, json, nowISO, type Env } from "../_lib/turso";
import { encodedValue, isRegisteredFlag, parseStoredValue } from "../_lib/flag-contract";

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor) return json({ ok: false, error: "forbidden" }, 403);
  const client = db(env);
  const status = new URL(request.url).searchParams.get("status") ?? "";
  if (!client) return json({ ok: true, status, requests: [], note: "Turso is not configured" });

  try {
    const result = status
      ? await client.execute({
          sql: `SELECT id, env, key, value, reason, proposer, approver, status, created_at, decided_at
                FROM change_requests WHERE status = ? ORDER BY created_at DESC`,
          args: [status],
        })
      : await client.execute({
          sql: `SELECT id, env, key, value, reason, proposer, approver, status, created_at, decided_at
                FROM change_requests ORDER BY created_at DESC`,
          args: [],
        });
    return json({ ok: true, status, requests: result.rows.map((row) => decode(row)) });
  } catch (error) {
    console.error("request list failed", errorCode(error));
    return json({ ok: false, error: "request list failed" }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || actor.role === "viewer") return json({ ok: false, error: "forbidden" }, 403);

  let body: { env?: string; key?: string; value?: unknown; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const envName = String(body.env ?? "default");
  const key = String(body.key ?? "");
  if (!key || body.value === undefined) return json({ ok: false, error: "missing key or value" }, 400);
  if (!isRegisteredFlag(key)) return json({ ok: false, error: "unknown flag" }, 404);

  const client = db(env);
  if (!client) return json({ ok: false, error: "Turso is not configured" }, 503);
  const reason = body.reason ? String(body.reason) : null;
  const createdAt = nowISO();
  try {
    const result = await client.execute({
      sql: `INSERT INTO change_requests (env, key, value, reason, proposer, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      args: [envName, key, encodedValue(body.value), reason, actor.email, createdAt],
    });
    return json({
      ok: true,
      request: {
        id: Number(result.lastInsertRowid),
        env: envName,
        key,
        value: body.value,
        reason,
        proposer: actor.email,
        status: "pending",
        created_at: createdAt,
      },
    }, 201);
  } catch (error) {
    console.error("request create failed", errorCode(error));
    return json({ ok: false, error: "request create failed" }, 500);
  }
};
