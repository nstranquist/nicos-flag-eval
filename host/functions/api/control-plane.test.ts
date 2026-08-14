import { createClient } from "@libsql/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onRequestPost as createRequest } from "./requests";
import { onRequestGet as listRequests } from "./requests";
import { onRequestPost as decideRequest } from "./requests/[id]/[decision]";
import { onRequestPost as createSchedule } from "./scheduled";
import { onRequestPost as ingestExposures } from "./exposures";
import { onRequestPost as firePending } from "../internal/fire-pending";
import { onRequestPost as evaluate } from "./evaluate";

const baseEnv = {
  ENVIRONMENT: "development",
  DEV_ADMIN_EMAIL: "operator@example.invalid",
  EDITOR_EMAILS: "operator@example.invalid",
};

let databasePath: string;
let database: ReturnType<typeof createClient>;
let databaseEnv: typeof baseEnv & { TURSO_URL: string; TURSO_AUTH_TOKEN: string; PAGES_INTERNAL_SECRET: string };

function request(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function get(url: string) {
  return new Request(url);
}

beforeAll(async () => {
  databasePath = join(mkdtempSync(join(tmpdir(), "flag-eval-demo-test-")), "flags.db");
  database = createClient({ url: `file:${databasePath}`, authToken: "test-token" });
  await database.executeMultiple(readFileSync(join(process.cwd(), "sql", "0001_schema.sql"), "utf8"));
  databaseEnv = {
    ...baseEnv,
    TURSO_URL: `file:${databasePath}`,
    TURSO_AUTH_TOKEN: "test-token",
    PAGES_INTERNAL_SECRET: "cron-test-secret",
  };
});

afterAll(() => {
  database.close();
  rmSync(databasePath, { force: true });
  rmSync(join(databasePath, ".."), { recursive: true, force: true });
});

describe("control-plane contracts", () => {
  it("does not report a pending request without a database", async () => {
    const response = await createRequest({
      request: request("https://flags.test/api/requests", {
        key: "checkout.promo-banner",
        value: true,
        reason: "test",
      }),
      env: baseEnv,
    } as any);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "Turso is not configured" });
  });

  it("persists and approves a request as one audited change", async () => {
    const created = await createRequest({
      request: request("https://flags.test/api/requests", {
        key: "checkout.promo-banner",
        value: true,
        env: "default",
        reason: "approve this test change",
      }),
      env: databaseEnv,
    } as any);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { request: { id: number } };

    const pending = await listRequests({
      request: get("https://flags.test/api/requests?status=pending"),
      env: databaseEnv,
    } as any);
    expect(pending.status).toBe(200);
    expect(((await pending.json()) as { requests: unknown[] }).requests).toHaveLength(1);

    const approved = await decideRequest({
      request: request(`https://flags.test/api/requests/${createdBody.request.id}/approve`, {}),
      env: databaseEnv,
      params: { id: String(createdBody.request.id), decision: "approve" },
    } as any);
    expect(approved.status).toBe(200);

    const override = await database.execute({
      sql: "SELECT value FROM overrides WHERE scope = 'cloud' AND env = 'default' AND key = ?",
      args: ["checkout.promo-banner"],
    });
    expect(override.rows[0]?.value).toBe("true");
    const audit = await database.execute({
      sql: "SELECT action FROM audit_events WHERE key = ? ORDER BY id DESC LIMIT 1",
      args: ["checkout.promo-banner"],
    });
    expect(audit.rows[0]?.action).toBe("request-approved");

    const evaluated = await evaluate({
      request: request("https://flags.test/api/evaluate", {
        key: "checkout.promo-banner",
        ctx: { env: "default", userId: "user-bob" },
      }),
      env: databaseEnv,
    } as any);
    expect(((await evaluated.json()) as Record<string, unknown>).source).toBe("cloud-override");
  });

  it("rejects an unknown scheduled key before persistence", async () => {
    const response = await createSchedule({
      request: request("https://flags.test/api/scheduled", {
        key: "flags.unknown",
        value: true,
        fire_at: "2099-01-01T00:00:00Z",
      }),
      env: baseEnv,
    } as any);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: "unknown flag" });
  });

  it("fires one due schedule once and writes an audit row", async () => {
    await database.execute({
      sql: `INSERT INTO scheduled_changes (env, key, value, fire_at, created_by, reason, status, created_at)
            VALUES ('default', ?, 'false', '2020-01-01T00:00:00Z', 'operator@example.invalid', 'cron test', 'pending', '2020-01-01T00:00:00Z')`,
      args: ["checkout.promo-banner"],
    });
    const response = await firePending({
      request: request("https://flags.test/internal/fire-pending", {}, { "x-cron-secret": "cron-test-secret" }),
      env: databaseEnv,
    } as any);
    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>).fired).toBe(1);
    const schedule = await database.execute({
      sql: "SELECT status FROM scheduled_changes ORDER BY id DESC LIMIT 1",
      args: [],
    });
    expect(schedule.rows[0]?.status).toBe("fired");
    const audit = await database.execute({
      sql: "SELECT action FROM audit_events WHERE action = 'schedule-fired' ORDER BY id DESC LIMIT 1",
      args: [],
    });
    expect(audit.rows[0]?.action).toBe("schedule-fired");
  });

  it("persists sampled exposures and rejects an unconfigured sink", async () => {
    const response = await ingestExposures({
      request: request("https://flags.test/api/exposures", {
        events: [{
          key: "checkout.promo-banner",
          value: true,
          source: "rule",
          ts: "2026-08-04T00:00:00Z",
        }],
      }),
      env: { ...databaseEnv, EXPOSURE_SAMPLE_RATE: "1" },
    } as any);
    expect(response.status).toBe(200);
    const exposures = await database.execute("SELECT COUNT(*) AS count FROM exposures");
    expect(Number(exposures.rows[0]?.count)).toBe(1);

    const unavailable = await ingestExposures({
      request: request("https://flags.test/api/exposures", {
        events: [{
          key: "checkout.promo-banner",
          value: true,
          source: "rule",
          ts: "2026-08-04T00:00:00Z",
        }],
      }),
      env: { ...baseEnv, EXPOSURE_SAMPLE_RATE: "1" },
    } as any);
    expect(unavailable.status).toBe(503);
  });

  it("requires the cron secret", async () => {
    const response = await firePending({
      request: request("https://flags.test/internal/fire-pending", {}),
      env: { PAGES_INTERNAL_SECRET: "secret" },
    } as any);
    expect(response.status).toBe(403);
  });
});
