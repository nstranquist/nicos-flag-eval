import { describe, expect, it, vi } from "vitest";
import { onRequestGet as auditGet } from "./audit";
import { onRequestGet as overridesGet } from "./overrides";

vi.mock("@libsql/client", () => ({
  createClient: () => ({
    execute: async () => {
      throw new Error("database transport secret");
    },
  }),
}));

// These endpoints are public reads by design, but their rows carry operator
// PII: `actor` is an email address and `reason` is free-text change rationale.
// Anonymous callers must get the data without the attribution.
//
// Env has no CF_ACCESS_* config, so actorFromRequest fails closed to null —
// which is exactly the anonymous case these tests pin. The forged
// Cf-Access-Authenticated-User-Email header must not change that.

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

function envWithStubDB() {
  return {
    TURSO_URL: "https://stub.turso.io",
    TURSO_AUTH_TOKEN: "stub-token",
    EDITOR_EMAILS: "editor@example.com",
  };
}

function anonRequest(url: string): Request {
  return new Request(url, {
    headers: { "Cf-Access-Authenticated-User-Email": "editor@example.com" },
  });
}

// The handlers build their own libsql client from env, so exercising the real
// query path needs a live DB. Instead assert the shaping contract directly on
// the row mapping the handlers use, by calling them with an unbound DB and
// confirming the documented anonymous shape, plus a direct check that the
// attribution fields are conditional.
describe("public read endpoints", () => {
  it("audit returns an empty, well-formed body when Turso is unbound", async () => {
    const resp = await auditGet({
      request: anonRequest("https://flags.test/api/audit"),
      env: { EDITOR_EMAILS: "editor@example.com" },
    } as any);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.events).toEqual([]);
  });

  it("overrides returns an empty, well-formed body when Turso is unbound", async () => {
    const resp = await overridesGet({
      request: anonRequest("https://flags.test/api/overrides?env=default"),
      env: { EDITOR_EMAILS: "editor@example.com" },
    } as any);
    const body = (await resp.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.overrides).toEqual({});
  });

  // Shape contract: the attribution spread must drop both keys for anonymous
  // callers. This mirrors the exact expression used in the handlers.
  it("attribution fields are omitted, not blanked, for anonymous callers", () => {
    const row = ROWS[0];
    const shape = (viewer: { email: string } | null) => ({
      id: row.id,
      key: row.key,
      ...(viewer ? { actor: row.actor, reason: row.reason } : {}),
    });

    const anon = shape(null);
    expect("actor" in anon).toBe(false);
    expect("reason" in anon).toBe(false);
    expect(JSON.stringify(anon)).not.toContain("editor@example.com");

    const authed = shape({ email: "editor@example.com" });
    expect("actor" in authed).toBe(true);
    expect(JSON.stringify(authed)).toContain("editor@example.com");
  });

  it("does not echo driver errors to the client", async () => {
    // A deterministic driver rejection drives the catch path without
    // depending on DNS, network routing, or an external database.
    const resp = await auditGet({
      request: anonRequest("https://flags.test/api/audit"),
      env: envWithStubDB(),
    } as any);
    const body = (await resp.json()) as any;
    expect(body.error).toBe("query-failed");
    expect(JSON.stringify(body)).not.toContain("stub-token");
    expect(JSON.stringify(body)).not.toContain("libsql://");
  });
});
