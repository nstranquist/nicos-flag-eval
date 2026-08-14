// Batch exposure events into Turso.

import { db, errorCode, json, type Env } from "../_lib/turso";
import { encodedValue, isRegisteredFlag } from "../_lib/flag-contract";

type ExposureEvent = {
  key: string;
  variant?: string;
  value: unknown;
  source: string;
  userId?: string;
  env?: string;
  project?: string;
  ts: string;
};

function sampleRate(env: Env): number {
  const raw = env.EXPOSURE_SAMPLE_RATE ?? "1.0";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(1, n);
}

function validEvent(event: ExposureEvent): boolean {
  return Boolean(
    event &&
      typeof event.key === "string" &&
      isRegisteredFlag(event.key) &&
      typeof event.source === "string" &&
      typeof event.ts === "string" &&
      Number.isFinite(Date.parse(event.ts)),
  );
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { events?: ExposureEvent[] };
  try {
    body = (await request.json()) as { events?: ExposureEvent[] };
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length > 100) return json({ ok: false, error: "maximum batch size is 100" }, 413);
  const invalid = events.find((event) => !validEvent(event));
  if (invalid) return json({ ok: false, error: "invalid exposure event" }, 400);
  const rate = sampleRate(env);
  const sampled = events.filter(() => Math.random() < rate);
  const client = db(env);
  if (sampled.length > 0 && !client) {
    return json({ ok: false, error: "exposure sink is not configured" }, 503);
  }
  if (client && sampled.length > 0) {
    try {
      await client.batch(
        sampled.map((event) => ({
          sql: `INSERT INTO exposures (ts, key, variant, value, source, user_id, env, project)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            event.ts,
            event.key,
            event.variant ?? null,
            encodedValue(event.value),
            event.source,
            event.userId ?? null,
            event.env ?? null,
            event.project ?? null,
          ],
        })),
        "write",
      );
    } catch (error) {
      console.error("exposure insert failed", errorCode(error));
      return json({ ok: false, error: "exposure insert failed" }, 500);
    }
  }
  return json({ ok: true, received: events.length, sampled: sampled.length, persisted: sampled.length, rate });
};
