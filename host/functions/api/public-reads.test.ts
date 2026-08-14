import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet as auditGet } from "./audit.ts";
import { onRequestGet as overridesGet } from "./overrides.ts";

const ROWS = [
  {
    id: 1,
    ts: "2026-07-25T00:00:00Z",
    action: "set",
    scope: "cloud",
    env: "default",
    key: "checkout.promo-banner",
    value: "true",
    prev: null,
    actor: "editor@example.com",
    reason: "enable for pilot",
    updated_at: "2026-07-25T00:00:00Z",
  },
];

const stubClient = {
  execute: async () => ({ rows: ROWS }),
};

function anonRequest(url: string): Request {
  return new Request(url, {
    headers: { "Cf-Access-Authenticated-User-Email": "editor@example.com" },
  });
}

test("audit omits attribution for anonymous callers", async () => {
  const resp = await auditGet({
    request: anonRequest("https://flags.test/api/audit"),
    env: { __testClient: stubClient },
  } as any);
  const body = (await resp.json()) as { ok: boolean; events: Array<Record<string, unknown>> };
  assert.equal(body.ok, true);
  assert.equal(body.events.length, 1);
  assert.equal("actor" in body.events[0], false);
  assert.equal("reason" in body.events[0], false);
  assert.equal(JSON.stringify(body).includes("editor@example.com"), false);
});

test("overrides omit meta for anonymous callers", async () => {
  const resp = await overridesGet({
    request: anonRequest("https://flags.test/api/overrides?env=default"),
    env: { __testClient: stubClient },
  } as any);
  const body = (await resp.json()) as { ok: boolean; overrides: Record<string, unknown>; meta?: unknown };
  assert.equal(body.ok, true);
  assert.equal(body.overrides["checkout.promo-banner"], true);
  assert.equal("meta" in body, false);
});

test("audit returns an empty body when Turso is unbound", async () => {
  const resp = await auditGet({
    request: anonRequest("https://flags.test/api/audit"),
    env: {},
  } as any);
  const body = (await resp.json()) as { ok: boolean; events: unknown[] };
  assert.equal(body.ok, true);
  assert.deepEqual(body.events, []);
});
