import { describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({
    rows: [
      {
        scope: "force-include",
        key: "checkout.promo-banner:user-alice",
        value: "true",
        actor: "operator@example.com",
        reason: "pilot",
        updated_at: "2026-08-04T00:00:00Z",
      },
    ],
  })),
}));

vi.mock("@libsql/client", () => ({
  createClient: () => ({ execute }),
}));

import { onRequestGet } from "./force-lists";

const baseEnv = {
  TURSO_URL: "https://stub.turso.io",
  TURSO_AUTH_TOKEN: "stub-token",
};

function request(): Request {
  return new Request(
    "https://flags.test/api/force-lists?flagKey=checkout.promo-banner&env=default",
  );
}

describe("force-list read contract", () => {
  it("omits operator metadata for anonymous readers", async () => {
    const response = await onRequestGet({ request: request(), env: baseEnv } as any);
    const body = (await response.json()) as any;
    expect(body.include).toEqual({ "user-alice": true });
    expect("meta" in body).toBe(false);
  });

  it("returns operator metadata to the explicit local development actor", async () => {
    const response = await onRequestGet({
      request: request(),
      env: { ...baseEnv, ENVIRONMENT: "development", DEV_ADMIN_EMAIL: "operator@example.com" },
    } as any);
    const body = (await response.json()) as any;
    expect(body.meta["user-alice"].actor).toBe("operator@example.com");
  });
});
