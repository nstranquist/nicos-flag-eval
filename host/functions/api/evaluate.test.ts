import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost } from "./evaluate.ts";

function request(body: unknown): Request {
  return new Request("https://flags.test/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("evaluate uses the demo catalog for staging", async () => {
  const response = await onRequestPost({
    request: request({
      key: "checkout.promo-banner",
      ctx: { userId: "user-alice", env: "staging" },
    }),
    env: {},
  } as any);
  const body = (await response.json()) as { ok: boolean; value: unknown; source: string };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.value, true);
  assert.equal(body.source, "rule");
});

test("evaluate ignores client override maps", async () => {
  const response = await onRequestPost({
    request: request({
      key: "checkout.promo-banner",
      ctx: {
        userId: "user-alice",
        env: "production",
        processOverrides: { "checkout.promo-banner": true },
        overrides: { "checkout.promo-banner": true },
      },
    }),
    env: {},
  } as any);
  const body = (await response.json()) as { ok: boolean; value: unknown; source: string };
  assert.equal(body.ok, true);
  assert.equal(body.value, false);
  assert.equal(body.source, "default");
});
