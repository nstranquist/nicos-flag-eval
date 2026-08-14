// POST   /api/overrides/:key   { value, scope?, env?, reason? }
// DELETE /api/overrides/:key?scope=cloud&env=default

import { db, actorFromRequest, errorCode, json, nowISO, type Env } from "../../_lib/turso.ts";
import { encodedValue, parseStoredValue, registeredOverrideFlag } from "../../_lib/flag-contract.ts";
import { publishLiveStreamEvent } from "../../_lib/stream-publish.ts";

const scopes = new Set(["cloud", "force-include", "force-exclude"]);

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || actor.role === "viewer") return json({ ok: false, error: "forbidden" }, 403);
  let body: { value?: unknown; scope?: string; env?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const key = (params as { key?: string }).key;
  if (!key) return json({ ok: false, error: "missing key" }, 400);
  if (body.value === undefined) return json({ ok: false, error: "missing value" }, 400);

  const scope = String(body.scope ?? "cloud");
  const envName = String(body.env ?? "default");
  if (!scopes.has(scope)) return json({ ok: false, error: "invalid scope" }, 400);
  if (!registeredOverrideFlag(scope, key)) return json({ ok: false, error: "unknown flag" }, 404);
  const reason = body.reason ? String(body.reason) : null;
  const encoded = encodedValue(body.value);
  const client = db(env);
  if (!client) {
    return json({ ok: true, key, scope, env: envName, value: body.value, actor: actor.email, persisted: false, note: "Turso is not configured" });
  }

  const ts = nowISO();
  const tx = await client.transaction("write");
  try {
    const previous = await tx.execute({
      sql: `SELECT value FROM overrides WHERE scope = ? AND env = ? AND key = ?`,
      args: [scope, envName, key],
    });
    const prev = previous.rows[0]?.value as string | undefined;
    await tx.execute({
      sql: `INSERT INTO overrides (scope, env, key, value, actor, reason, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (scope, env, key) DO UPDATE SET
              value = excluded.value, actor = excluded.actor,
              reason = excluded.reason, updated_at = excluded.updated_at`,
      args: [scope, envName, key, encoded, actor.email, reason, ts],
    });
    const audit = await tx.execute({
      sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
            VALUES (?, 'set', ?, ?, ?, ?, ?, ?, ?)
            RETURNING id`,
      args: [ts, scope, envName, key, encoded, prev ?? null, actor.email, reason],
    });
    await tx.commit();
    const auditId = Number(audit.rows[0]?.id);
    if (Number.isSafeInteger(auditId)) {
      await publishLiveStreamEvent(env, { id: auditId, action: "set", scope, env: envName, key, value: body.value, prev: prev == null ? null : parseStoredValue(prev), ts });
    }
    return json({ ok: true, key, scope, env: envName, value: body.value, actor: actor.email, prev: prev ? parseStoredValue(prev) : null, persisted: true });
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    console.error("override write failed", errorCode(error));
    return json({ ok: false, error: "write-failed" }, 500);
  } finally {
    tx.close();
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const actor = await actorFromRequest(request, env);
  if (!actor || actor.role === "viewer") return json({ ok: false, error: "forbidden" }, 403);
  const key = (params as { key?: string }).key;
  if (!key) return json({ ok: false, error: "missing key" }, 400);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "cloud";
  const envName = url.searchParams.get("env") ?? "default";
  if (!scopes.has(scope)) return json({ ok: false, error: "invalid scope" }, 400);
  if (!registeredOverrideFlag(scope, key)) return json({ ok: false, error: "unknown flag" }, 404);

  const client = db(env);
  if (!client) return json({ ok: true, key, cleared: false, persisted: false, note: "Turso is not configured" });
  const ts = nowISO();
  const tx = await client.transaction("write");
  try {
    const previous = await tx.execute({
      sql: `SELECT value, reason FROM overrides WHERE scope = ? AND env = ? AND key = ?`,
      args: [scope, envName, key],
    });
    const row = previous.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      await tx.rollback();
      return json({ ok: true, key, cleared: false, persisted: true });
    }
    const prev = String(row.value);
    await tx.execute({
      sql: `DELETE FROM overrides WHERE scope = ? AND env = ? AND key = ?`,
      args: [scope, envName, key],
    });
    const audit = await tx.execute({
      sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
            VALUES (?, 'clear', ?, ?, ?, NULL, ?, ?, ?)
            RETURNING id`,
      args: [ts, scope, envName, key, prev, actor.email, row.reason == null ? null : String(row.reason)],
    });
    await tx.commit();
    const auditId = Number(audit.rows[0]?.id);
    if (Number.isSafeInteger(auditId)) {
      await publishLiveStreamEvent(env, { id: auditId, action: "clear", scope, env: envName, key, value: null, prev: parseStoredValue(prev), ts });
    }
    return json({ ok: true, key, cleared: true, prev: parseStoredValue(prev), persisted: true });
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    console.error("override clear failed", errorCode(error));
    return json({ ok: false, error: "write-failed" }, 500);
  } finally {
    tx.close();
  }
};
