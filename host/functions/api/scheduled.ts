// Create and list scheduled flag changes.

import { actorFromRequest, db, errorCode, json, nowISO, type Env } from "../_lib/turso";
import { encodedValue, isRegisteredFlag, parseStoredValue } from "../_lib/flag-contract";

function decode(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    env: String(row.env),
    key: String(row.key),
    value: parseStoredValue(row.value),
    fire_at: String(row.fire_at),
    created_by: String(row.created_by),
    reason: row.reason ?? null,
    status: String(row.status),
    fired_at: row.fired_at ?? null,
    created_at: String(row.created_at),
  };
}

function canWrite(role: string): boolean {
  return role === "admin" || role === "editor";
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor) return json({ ok: false, error: "forbidden" }, 403);
  const url = new URL(request.url);
  const envName = url.searchParams.get("env") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const client = db(env);
  if (!client) return json({ ok: true, env: envName, status, scheduled: [], note: "Turso is not configured" });

  try {
    const where: string[] = [];
    const args: string[] = [];
    if (envName) { where.push("env = ?"); args.push(envName); }
    if (status) { where.push("status = ?"); args.push(status); }
    const result = await client.execute({
      sql: `SELECT id, env, key, value, fire_at, created_by, reason, status, fired_at, created_at
            FROM scheduled_changes${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
            ORDER BY fire_at ASC`,
      args,
    });
    return json({ ok: true, env: envName, status, scheduled: result.rows.map((row) => decode(row)) });
  } catch (error) {
    console.error("schedule list failed", errorCode(error));
    return json({ ok: false, error: "schedule list failed" }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || !canWrite(actor.role)) return json({ ok: false, error: "forbidden" }, 403);
  let body: { env?: string; key?: string; value?: unknown; fire_at?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const envName = String(body.env ?? "default");
  const key = String(body.key ?? "");
  const fireAt = String(body.fire_at ?? "");
  if (!key || body.value === undefined || !fireAt) return json({ ok: false, error: "missing key, value, or fire_at" }, 400);
  if (!isRegisteredFlag(key)) return json({ ok: false, error: "unknown flag" }, 404);
  const fireTime = Date.parse(fireAt);
  if (!Number.isFinite(fireTime) || fireTime <= Date.now()) return json({ ok: false, error: "fire_at must be a future ISO timestamp" }, 400);

  const client = db(env);
  if (!client) return json({ ok: false, error: "Turso is not configured" }, 503);
  const createdAt = nowISO();
  try {
    const result = await client.execute({
      sql: `INSERT INTO scheduled_changes (env, key, value, fire_at, created_by, reason, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      args: [envName, key, encodedValue(body.value), new Date(fireTime).toISOString(), actor.email, body.reason ? String(body.reason) : null, createdAt],
    });
    return json({
      ok: true,
      scheduled: {
        id: Number(result.lastInsertRowid),
        env: envName,
        key,
        value: body.value,
        fire_at: new Date(fireTime).toISOString(),
        created_by: actor.email,
        reason: body.reason ?? null,
        status: "pending",
        created_at: createdAt,
      },
    }, 201);
  } catch (error) {
    console.error("schedule create failed", errorCode(error));
    return json({ ok: false, error: "schedule create failed" }, 500);
  }
};
