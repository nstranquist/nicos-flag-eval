import { describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({
    rows: [
      {
        id: 8,
        action: "set",
        scope: "cloud",
        env: "iat",
        key: "checkout.promo-banner",
        value: "true",
        prev: "false",
        actor: "operator@example.com",
        reason: "replay test",
        ts: "2026-08-04T00:00:00Z",
      },
    ],
  })),
}));

vi.mock("@libsql/client", () => ({
  createClient: () => ({ execute }),
}));

import { onRequestGet } from "./stream";

const env = {
  TURSO_URL: "https://stub.turso.io",
  TURSO_AUTH_TOKEN: "stub-token",
};

async function frames(request: Request): Promise<string> {
  const response = await onRequestGet({ request, env } as any);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  return response.text();
}

describe("stream replay contract", () => {
  it("replays ordered audit rows after Last-Event-ID without exposing attribution", async () => {
    const body = await frames(new Request("https://flags.test/api/stream?env=iat", {
      headers: { "Last-Event-ID": "7" },
    }));

    expect(body).toContain("event: snapshot");
    expect(body).toContain("retry: 25000");
    expect(body).toContain("\"replayed\":1");
    expect(body).toContain("id: 8");
    expect(body).toContain("event: override-changed");
    expect(body).toContain("\"value\":true");
    expect(body).not.toContain("operator@example.com");
  });

  it("returns a bounded no-database response with an explicit limit", async () => {
    const response = await onRequestGet({
      request: new Request("https://flags.test/api/stream?env=default"),
      env: {},
    } as any);
    const body = await response.text();
    expect(body).toContain("Turso is not configured; replay unavailable");
    expect(body).toContain("event: heartbeat");
  });
});
