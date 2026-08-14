// Typed client for the flag-eval-demo Pages Functions.

export type FlagType = "boolean" | "string" | "number" | "json";
export type Scope = "cross-project" | "cross-project";
export type EvalSource =
  | "process-flag" | "env" | "personal-override" | "repo-override"
  | "cloud-override" | "sticky-bucket" | "force-include" | "force-exclude"
  | "legacy-gate" | "rule" | "kill-date" | "default" | "missing";

export interface FlagSpec {
  key: string;
  type: FlagType;
  scope: Scope;
  default: unknown;
  owner?: string;
  description?: string;
  tags?: string[];
  hashVersion?: number;
  stickyBucketing?: boolean;
  namespace?: string;
  namespaceRange?: [number, number];
  killDate?: string;
  envVar?: string;
  rules?: any[];
  force_include?: Record<string, unknown>;
  force_exclude?: string[];
  _synthesized?: boolean;
}

export interface Manifest {
  schemaVersion: number;
  flags: FlagSpec[];
}

export interface EvalContext {
  userId?: string;
  env?: string;
  project?: string;
  attrs?: Record<string, string>;
}

export interface EvalResult {
  ok: boolean;
  key: string;
  value: unknown;
  source: EvalSource;
  reason: string;
  rule?: number;
  variant?: string;
  found: boolean;
}

export interface VersionInfo {
  commit: string;
  builtAt: string;
  manifestSha256: string;
}

export interface OverridesResponse {
  ok: boolean;
  env: string;
  overrides: Record<string, unknown>;
  meta?: Record<string, { actor: string; reason: string | null; updated_at: string }>;
  note?: string;
}

export interface AuditEvent {
  id: number;
  ts: string;
  action: "set" | "clear" | string;
  scope: string;
  env: string;
  key: string;
  value: string | null;
  prev: string | null;
  actor: string;
  reason: string | null;
}

export async function fetchManifest(): Promise<Manifest> {
  const r = await fetch("/api/manifest");
  if (!r.ok) throw new Error(`manifest fetch: HTTP ${r.status}`);
  return r.json();
}

export async function fetchVersion(): Promise<VersionInfo> {
  const r = await fetch("/api/version");
  if (!r.ok) throw new Error(`version fetch: HTTP ${r.status}`);
  return r.json();
}

export async function fetchOverrides(envName = "default"): Promise<OverridesResponse> {
  const r = await fetch(`/api/overrides?env=${encodeURIComponent(envName)}`);
  return r.json();
}

export async function fetchAudit(key?: string, limit = 50): Promise<AuditEvent[]> {
  const url = new URL("/api/audit", window.location.origin);
  if (key) url.searchParams.set("key", key);
  url.searchParams.set("limit", String(limit));
  const r = await fetch(url.toString());
  const body = await r.json();
  return body.events ?? [];
}

export async function setOverride(
  key: string,
  value: unknown,
  opts: { env?: string; reason?: string; scope?: string } = {},
): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/overrides/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      value,
      env: opts.env ?? "default",
      reason: opts.reason ?? null,
      scope: opts.scope ?? "cloud",
    }),
  });
  return r.json();
}

export async function clearOverride(
  key: string,
  opts: { env?: string; scope?: string } = {},
): Promise<{ ok: boolean; error?: string; cleared?: boolean }> {
  const url = new URL(`/api/overrides/${encodeURIComponent(key)}`, window.location.origin);
  url.searchParams.set("env", opts.env ?? "default");
  url.searchParams.set("scope", opts.scope ?? "cloud");
  const r = await fetch(url.toString(), { method: "DELETE" });
  return r.json();
}

// Force-include / force-exclude overrides — composed on top of
// setOverride/clearOverride. Key encoding: `<flagKey>:<userId>`.
export type ForceScope = "force-include" | "force-exclude";

export interface ForceListsResponse {
  ok: boolean;
  flagKey: string;
  env: string;
  include: Record<string, unknown>;
  exclude: string[];
  meta?: Record<string, { actor: string; reason: string | null; updated_at: string; scope: string }>;
  note?: string;
}

export async function fetchForceLists(flagKey: string, envName = "default"): Promise<ForceListsResponse> {
  const url = new URL("/api/force-lists", window.location.origin);
  url.searchParams.set("flagKey", flagKey);
  url.searchParams.set("env", envName);
  const r = await fetch(url.toString());
  return r.json();
}

export async function setForceEntry(
  flagKey: string,
  userId: string,
  value: unknown,
  opts: { env?: string; scope: ForceScope; reason?: string },
): Promise<{ ok: boolean; error?: string }> {
  return setOverride(`${flagKey}:${userId}`, value, {
    env: opts.env,
    scope: opts.scope,
    reason: opts.reason,
  });
}

export async function clearForceEntry(
  flagKey: string,
  userId: string,
  opts: { env?: string; scope: ForceScope },
): Promise<{ ok: boolean; error?: string; cleared?: boolean }> {
  return clearOverride(`${flagKey}:${userId}`, {
    env: opts.env,
    scope: opts.scope,
  });
}

export async function evaluate(key: string, ctx: EvalContext): Promise<EvalResult> {
  const r = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, ctx }),
  });
  return r.json();
}
