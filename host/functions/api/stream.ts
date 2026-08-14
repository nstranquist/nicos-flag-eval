// KEP-007 — GET /api/stream?env=<env>
// Server-Sent Events replay surface for override changes + manifest publishes.
//
// The current Pages implementation replays the durable audit cursor on
// connection and emits one heartbeat. A live fanout transport remains a
// separate Durable Object or equivalent edge service decision.
//
// Heartbeats keep intermediate proxies from closing idle connections.
//
// Event types:
//   event: snapshot           data: { env, after, replayed, note }
//   event: override-changed   data: { key, scope, env, value, actor, ts }
//   event: manifest-changed   data: { manifestSha256, manifestUrl } (reserved)
//   event: heartbeat          data: { ts }
//
// Reconnect: clients pass `Last-Event-ID: <id>` to resume from audit rows.

import { actorFromRequest, db, errorCode, type Env } from "../_lib/turso";
import { parseStoredValue } from "../_lib/flag-contract";
import type {} from "@cloudflare/workers-types";

const ENCODER = new TextEncoder();
const RECONNECT_AFTER_MS = 25_000;

function sseFrame(event: string, data: unknown, id?: number, retryMs?: number): Uint8Array {
  const lines: string[] = [];
  if (id !== undefined) lines.push(`id: ${id}`);
  if (retryMs !== undefined) lines.push(`retry: ${retryMs}`);
  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push("", "");
  return ENCODER.encode(lines.join("\n"));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const envName = url.searchParams.get("env") ?? "default";
  const lastEventId = parseCursor(request.headers.get("Last-Event-ID") ?? url.searchParams.get("lastEventId"));
  const viewer = await actorFromRequest(request, env);
  const client = db(env);
  const replay: Array<{ id: number; event: string; data: Record<string, unknown> }> = [];
  let note = "replay unavailable";

  if (client) {
    try {
      const result = await client.execute({
        sql: `SELECT id, action, scope, env, key, value, prev, actor, reason, ts
             FROM audit_events
             WHERE id > ? AND env = ?
               AND action IN ('set', 'clear', 'promote', 'request-approved', 'schedule-fired')
             ORDER BY id ASC
             LIMIT 100`,
        args: [lastEventId, envName],
      });
      for (const row of result.rows as Array<Record<string, unknown>>) {
        replay.push({
          id: Number(row.id),
          event: "override-changed",
          data: {
            action: String(row.action),
            scope: String(row.scope),
            env: String(row.env),
            key: String(row.key),
            value: row.value == null ? null : parseStoredValue(String(row.value)),
            prev: row.prev == null ? null : parseStoredValue(String(row.prev)),
            ts: String(row.ts),
            ...(viewer ? { actor: String(row.actor), reason: row.reason == null ? null : String(row.reason) } : {}),
          },
        });
      }
      note = replay.length === 100 ? "replay capped at 100 events" : "audit replay complete";
    } catch (error) {
      console.error("stream replay failed", errorCode(error));
      note = "replay query failed";
    }
  } else {
    note = "Turso is not configured; replay unavailable";
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(sseFrame("snapshot", {
        ts: new Date().toISOString(),
        env: envName,
        after: lastEventId,
        replayed: replay.length,
        note,
      }, undefined, RECONNECT_AFTER_MS));
      for (const item of replay) {
        controller.enqueue(sseFrame(item.event, item.data, item.id));
      }

      // This bounded response does not claim live fanout. Clients reconnect
      // with the last received audit ID until a live edge transport is enabled.
      controller.enqueue(sseFrame("heartbeat", { ts: new Date().toISOString() }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
};

function parseCursor(value: string | null): number {
  const cursor = Number(value ?? 0);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}
