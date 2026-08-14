// Cloudflare Access identity verification.
//
// WHY THIS EXISTS
//
// Authorizing surfaces must not read an actor's identity from the plaintext
// `Cf-Access-Authenticated-User-Email` request header. That header is only
// trustworthy when Cloudflare Access fronts the deployment and strips client
// supplied copies. This module verifies the signed assertion Access issues
// alongside it (`Cf-Access-Jwt-Assertion`), an RS256 JWT signed by the team's
// rotating keys.
//
// FAIL-CLOSED CONTRACT
//
// When CF_ACCESS_TEAM_DOMAIN / ACCESS_AUDIENCE are unset, this module returns no
// identity at all rather than falling back to the header. Privileged routes
// therefore refuse to serve until Access is configured. That is deliberate: an
// unconfigured deployment is exactly the state in which the header is forgeable,
// so "no config" must mean "no access", never "trust the client".
//
// Verification uses the platform WebCrypto primitive for the signature; this
// module only sequences the JWKS lookup and validates registered claims.

export interface AccessConfig {
  /** e.g. "myteam.cloudflareaccess.com" */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
}

export interface AccessEnv {
  CF_ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
}

/** accessConfig returns null when Access is not fully configured. */
export function accessConfig(env: AccessEnv): AccessConfig | null {
  const teamDomain = (env.CF_ACCESS_TEAM_DOMAIN ?? "").trim().replace(/^https:\/\//, "").replace(/\/$/, "");
  const aud = (env.ACCESS_AUDIENCE ?? "").trim();
  if (!teamDomain || !aud) return null;
  return { teamDomain, aud };
}

interface JWK {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JWKSCacheEntry {
  keys: JWK[];
  fetchedAt: number;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
// Module-scope cache. Workers isolates are short-lived, so this is a
// best-effort request-coalescing cache, not a correctness dependency.
const jwksCache = new Map<string, JWKSCacheEntry>();

/** Clock skew allowance for exp/nbf/iat comparisons. */
const CLOCK_SKEW_SECONDS = 60;

async function fetchJWKS(teamDomain: string, now: number): Promise<JWK[]> {
  const cached = jwksCache.get(teamDomain);
  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const resp = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!resp.ok) throw new Error(`Access JWKS fetch failed: ${resp.status}`);
  const body = (await resp.json()) as { keys?: JWK[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(teamDomain, { keys, fetchedAt: now });
  return keys;
}

/** Exposed for tests: drop cached JWKS so a test can control the fetch. */
export function __resetJWKSCache(): void {
  jwksCache.clear();
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeJSONSegment(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  } catch {
    return null;
  }
}

function audienceMatches(claim: unknown, expected: string): boolean {
  if (typeof claim === "string") return claim === expected;
  if (Array.isArray(claim)) return claim.some((a) => a === expected);
  return false;
}

/**
 * verifiedAccessEmail returns the email Cloudflare Access asserted for this
 * request, or null when the request carries no valid assertion.
 *
 * Returning null is always safe-by-default: callers must treat it as anonymous.
 */
export async function verifiedAccessEmail(
  request: Request,
  env: AccessEnv,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const cfg = accessConfig(env);
  if (!cfg) return null;

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ??
    readCookie(request.headers.get("Cookie"), "CF_Authorization");
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  const header = decodeJSONSegment(headerSeg);
  const payload = decodeJSONSegment(payloadSeg);
  if (!header || !payload) return null;

  // Pin the algorithm. Accepting `alg` from the token is how "alg: none" and
  // HMAC-confusion attacks work.
  if (header.alg !== "RS256") return null;
  const kid = typeof header.kid === "string" ? header.kid : null;
  if (!kid) return null;

  let keys: JWK[];
  try {
    keys = await fetchJWKS(cfg.teamDomain, nowMs);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return null;

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(signatureSeg),
      new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const nowSeconds = Math.floor(nowMs / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
  if (exp === null || nowSeconds > exp + CLOCK_SKEW_SECONDS) return null;
  if (nbf !== null && nowSeconds + CLOCK_SKEW_SECONDS < nbf) return null;

  if (payload.iss !== `https://${cfg.teamDomain}`) return null;
  if (!audienceMatches(payload.aud, cfg.aud)) return null;

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  return email || null;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
