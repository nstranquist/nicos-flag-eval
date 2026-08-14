import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { accessConfig, verifiedAccessEmail, __resetJWKSCache } from "./access";

const TEAM = "testteam.cloudflareaccess.com";
const AUD = "aud-tag-123";
const ENV = { CF_ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUDIENCE: AUD };
const NOW = 1_800_000_000_000; // fixed clock

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let keyPair: CryptoKeyPair;
let jwk: JsonWebKey;

async function makeToken(
  payload: Record<string, unknown>,
  opts: { alg?: string; kid?: string; sign?: boolean } = {},
): Promise<string> {
  const header = { alg: opts.alg ?? "RS256", kid: opts.kid ?? "test-kid", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  if (opts.sign === false) return `${h}.${p}.${b64url("not-a-real-signature")}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

function validClaims(over: Record<string, unknown> = {}) {
  const nowSec = Math.floor(NOW / 1000);
  return {
    iss: `https://${TEAM}`,
    aud: AUD,
    email: "Nico@Example.com",
    exp: nowSec + 600,
    nbf: nowSec - 10,
    iat: nowSec - 10,
    ...over,
  };
}

function req(token?: string): Request {
  const headers: Record<string, string> = {
    // Always present, always forged. It must never influence the result.
    "Cf-Access-Authenticated-User-Email": "attacker@evil.test",
  };
  if (token) headers["Cf-Access-Jwt-Assertion"] = token;
  return new Request("https://flags.test/api/overrides/x", { headers });
}

beforeEach(async () => {
  __resetJWKSCache();
  keyPair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  jwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ keys: [{ kid: "test-kid", kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" }] }), {
        status: 200,
      }),
    ),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("accessConfig", () => {
  it("is null until both team domain and aud are set", () => {
    expect(accessConfig({})).toBeNull();
    expect(accessConfig({ CF_ACCESS_TEAM_DOMAIN: TEAM })).toBeNull();
    expect(accessConfig({ ACCESS_AUDIENCE: AUD })).toBeNull();
    expect(accessConfig(ENV)).toEqual({ teamDomain: TEAM, aud: AUD });
  });

  it("normalizes a scheme-prefixed team domain", () => {
    expect(accessConfig({ ...ENV, CF_ACCESS_TEAM_DOMAIN: `https://${TEAM}/` })?.teamDomain).toBe(TEAM);
  });
});

describe("verifiedAccessEmail", () => {
  it("accepts a correctly signed assertion and returns the normalized email", async () => {
    const token = await makeToken(validClaims());
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBe("nico@example.com");
  });

  // The core regression: the forged plaintext header is present on every
  // request built by req(), and must never grant identity on its own.
  it("ignores the plaintext email header when no assertion is present", async () => {
    await expect(verifiedAccessEmail(req(), ENV, NOW)).resolves.toBeNull();
  });

  it("fails closed when Access is not configured, even with a valid assertion", async () => {
    const token = await makeToken(validClaims());
    await expect(verifiedAccessEmail(req(token), {}, NOW)).resolves.toBeNull();
  });

  it("rejects an unsigned / wrongly signed token", async () => {
    const token = await makeToken(validClaims(), { sign: false });
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });

  it("rejects algorithm confusion (alg: none and HS256)", async () => {
    for (const alg of ["none", "HS256"]) {
      const token = await makeToken(validClaims(), { alg, sign: false });
      await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
    }
  });

  it("rejects an unknown signing key id", async () => {
    const token = await makeToken(validClaims(), { kid: "someone-elses-kid" });
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });

  it("rejects an expired assertion", async () => {
    const token = await makeToken(validClaims({ exp: Math.floor(NOW / 1000) - 3600 }));
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });

  it("rejects a not-yet-valid assertion", async () => {
    const token = await makeToken(validClaims({ nbf: Math.floor(NOW / 1000) + 3600 }));
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });

  it("rejects a token minted for another Access application", async () => {
    const token = await makeToken(validClaims({ aud: "some-other-app" }));
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });

  it("rejects a token from another team", async () => {
    const token = await makeToken(validClaims({ iss: "https://attacker.cloudflareaccess.com" }));
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });

  it("accepts an array audience containing the configured aud", async () => {
    const token = await makeToken(validClaims({ aud: ["other", AUD] }));
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBe("nico@example.com");
  });

  it("returns null when the assertion carries no email claim", async () => {
    const token = await makeToken(validClaims({ email: undefined }));
    await expect(verifiedAccessEmail(req(token), ENV, NOW)).resolves.toBeNull();
  });
});
