import assert from "node:assert/strict";
import test from "node:test";
import { onRequestDelete, onRequestPost } from "./[key].ts";

const devEnv = {
  ENVIRONMENT: "development",
  DEV_ADMIN_EMAIL: "editor@example.com",
  EDITOR_EMAILS: "editor@example.com",
};

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("force-include write accepts a registered flag plus user id", async () => {
  const response = await onRequestPost({
    request: request("POST", "https://flags.test/api/overrides/checkout.promo-banner:user-alice", {
      value: true,
      scope: "force-include",
      env: "staging",
    }),
    env: devEnv,
    params: { key: "checkout.promo-banner:user-alice" },
  } as any);
  const body = (await response.json()) as { ok: boolean; error?: string; persisted?: boolean };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.persisted, false);
});

test("force-include write rejects an unknown flag prefix", async () => {
  const response = await onRequestPost({
    request: request("POST", "https://flags.test/api/overrides/missing.flag:user-alice", {
      value: true,
      scope: "force-include",
    }),
    env: devEnv,
    params: { key: "missing.flag:user-alice" },
  } as any);
  const body = (await response.json()) as { ok: boolean; error?: string };
  assert.equal(response.status, 404);
  assert.equal(body.error, "unknown flag");
});

test("force-include delete uses the same registered-prefix rule", async () => {
  const response = await onRequestDelete({
    request: request(
      "DELETE",
      "https://flags.test/api/overrides/checkout.promo-banner:user-alice?scope=force-include&env=staging",
    ),
    env: devEnv,
    params: { key: "checkout.promo-banner:user-alice" },
  } as any);
  const body = (await response.json()) as { ok: boolean; error?: string };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});
