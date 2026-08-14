// Shared Turso client for the flag-eval-demo Pages Functions.
//
// One libsql client per request; @libsql/client is HTTP-mode under the hood
// so connection-pool semantics are not a concern in the Pages runtime.
//
// Auth model:
//
//   Production:  identity comes from a VERIFIED Cloudflare Access assertion
//                (_lib/access.ts verifies the Cf-Access-Jwt-Assertion RS256
//                JWT against the team JWKS). The plaintext
//                Cf-Access-Authenticated-User-Email header is never trusted —
//                any client can set it. Roles gate on EDITOR_EMAILS then
//                @example.com membership.
//
//   Local dev:   no Access in `wrangler pages dev`. env.DEV_ADMIN_EMAIL acts
//                as the actor, but ONLY when ENVIRONMENT=development. Without
//                that explicit marker the fallback stays off, so it cannot
//                become a production authentication bypass.
//
// Unconfigured Access ⇒ no identity ⇒ privileged routes refuse. See access.ts.

import { createClient, type Client } from "@libsql/client";
import { verifiedAccessEmail } from "./access";

export type Env = {
  TURSO_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  EDITOR_EMAILS?: string;
  DEV_ADMIN_EMAIL?: string;
  PAGES_INTERNAL_SECRET?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  STREAM_PUBLISH_URL?: string;
  STREAM_PUBLISH_SECRET?: string;
  ENVIRONMENT?: string;
  EXPOSURE_SAMPLE_RATE?: string;
};

export function db(env: Env): Client | null {
  if (!env.TURSO_URL || !env.TURSO_AUTH_TOKEN) return null;
  return createClient({ url: env.TURSO_URL, authToken: env.TURSO_AUTH_TOKEN });
}

export type Role = "viewer" | "editor" | "admin";

export interface Actor {
  email: string;
  role: Role;
}

/**
 * actorFromRequest resolves the authenticated actor, or null for anonymous.
 *
 * Identity comes from a *verified* Cloudflare Access assertion — never from the
 * plaintext `Cf-Access-Authenticated-User-Email` header, which any client can
 * set while Access is not fronting the deployment. See _lib/access.ts.
 *
 * Fails closed: with Access unconfigured this returns null, so privileged
 * routes refuse rather than trusting a forgeable header.
 */
export async function actorFromRequest(request: Request, env: Env): Promise<Actor | null> {
  let email = await verifiedAccessEmail(request, env);

  if (!email && isDevRuntime(env) && env.DEV_ADMIN_EMAIL) {
    // Local `wrangler pages dev` has no Access in front of it. This fallback is
    // gated on an explicit development marker so it can never activate on the
    // deployed project, where it would be a full authentication bypass.
    email = env.DEV_ADMIN_EMAIL.trim().toLowerCase();
    console.warn(`[flag-eval-demo] DEV_ADMIN_EMAIL fallback active for ${request.url} — development only`);
  }
  if (!email) return null;

  const adminList = (env.EDITOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminList.includes(email)) return { email, role: "admin" };
  if (email.endsWith("@example.com")) return { email, role: "editor" };
  return { email, role: "viewer" };
}

/**
 * isDevRuntime gates the local-dev identity fallback. It must be explicit —
 * inferring "dev" from the absence of production config is what turns a
 * convenience fallback into a production bypass.
 */
export function isDevRuntime(env: Env): boolean {
  return (env.ENVIRONMENT ?? "").trim().toLowerCase() === "development";
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function errorCode(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/** Append-only audit row. Best-effort; failures are logged but not returned. */
export async function writeAudit(
  c: Client,
  row: {
    action: string;
    scope: string;
    env: string;
    key: string;
    value?: string | null;
    prev?: string | null;
    actor: string;
    reason?: string;
  },
): Promise<void> {
  try {
    await c.execute({
      sql: `INSERT INTO audit_events (ts, action, scope, env, key, value, prev, actor, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        nowISO(),
        row.action,
        row.scope,
        row.env,
        row.key,
        row.value ?? null,
        row.prev ?? null,
        row.actor,
        row.reason ?? null,
      ],
    });
  } catch (e) {
    console.error("audit insert failed:", errorCode(e));
  }
}
