import type { FlagEvalProvider } from "./provider";
import type { FlagSpec, FlagValue, FlagsManifest } from "../../ts/evaluator.ts";

export type ManifestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ManifestRefreshStatus = "updated" | "unchanged" | "not-modified";

export type ManifestRefreshResult = {
  status: ManifestRefreshStatus;
  manifest: FlagsManifest;
  digest: string;
  etag?: string;
};

export class ManifestSourceError extends Error {
  readonly status?: number;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ManifestSourceError";
    this.status = options.status;
  }
}

export type RemoteManifestSourceOptions = {
  url: string | URL;
  fetch?: ManifestFetch;
  headers?: HeadersInit;
  timeoutMs?: number;
};

/**
 * Fetches and validates a manifest without owning an evaluator or scheduler.
 * Hosts decide when to call refresh and when to pass the result to a provider.
 */
export class RemoteManifestSource {
  private readonly url: string | URL;
  private readonly fetchImpl: ManifestFetch;
  private readonly headers: Headers;
  private readonly timeoutMs: number;
  private currentManifest?: FlagsManifest;
  private currentDigest?: string;
  private etag?: string;

  constructor(options: RemoteManifestSourceOptions) {
    this.url = options.url;
    this.fetchImpl = options.fetch ?? fetch;
    this.headers = new Headers(options.headers);
    this.headers.set("accept", "application/json");
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new ManifestSourceError("timeoutMs must be greater than zero");
    }
  }

  get manifest(): FlagsManifest | undefined {
    return this.currentManifest;
  }

  get digest(): string | undefined {
    return this.currentDigest;
  }

  async refresh(): Promise<ManifestRefreshResult> {
    const headers = new Headers(this.headers);
    if (this.etag) headers.set("if-none-match", this.etag);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, { headers, signal: controller.signal });
    } catch (error) {
      throw new ManifestSourceError("manifest fetch failed", { cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 304) {
      if (!this.currentManifest || !this.currentDigest) {
        throw new ManifestSourceError("manifest returned 304 before an initial 200 response", { status: 304 });
      }
      return {
        status: "not-modified",
        manifest: this.currentManifest,
        digest: this.currentDigest,
        ...(this.etag ? { etag: this.etag } : {}),
      };
    }
    if (!response.ok) {
      throw new ManifestSourceError(`manifest fetch returned HTTP ${response.status}`, { status: response.status });
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      throw new ManifestSourceError("manifest response was not valid JSON", { cause: error });
    }
    const manifest = validateManifest(value);
    const digest = await digestManifest(manifest);
    const nextEtag = response.headers.get("etag") ?? undefined;
    const status = this.currentDigest === digest ? "unchanged" : "updated";
    this.currentManifest = manifest;
    this.currentDigest = digest;
    this.etag = nextEtag ?? this.etag;
    return {
      status,
      manifest,
      digest,
      ...(this.etag ? { etag: this.etag } : {}),
    };
  }
}

/** Refresh a provider from a source while keeping transport ownership outside the provider. */
export async function refreshProvider(
  provider: FlagEvalProvider,
  source: RemoteManifestSource,
): Promise<ManifestRefreshResult> {
  const result = await source.refresh();
  if (result.status === "updated") provider.replaceManifest(result.manifest);
  return result;
}

export function validateManifest(value: unknown): FlagsManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.flags)) {
    throw new ManifestSourceError("manifest must contain schemaVersion 1 and a flags array");
  }
  const keys = new Set<string>();
  const flags = value.flags.map((candidate, index) => validateFlag(candidate, `flags[${index}]`, keys));
  return { schemaVersion: 1, flags };
}

export async function digestManifest(manifest: FlagsManifest): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalJson(manifest));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateFlag(value: unknown, path: string, keys: Set<string>): FlagSpec {
  if (!isRecord(value)) throw new ManifestSourceError(`${path} must be an object`);
  const key = stringField(value.key, `${path}.key`);
  if (keys.has(key)) throw new ManifestSourceError(`duplicate flag key: ${key}`);
  keys.add(key);
  const type = value.type;
  if (type !== "boolean" && type !== "string" && type !== "number" && type !== "json") {
    throw new ManifestSourceError(`${path}.type is invalid`);
  }
  if (!isValidValue(value.default)) throw new ManifestSourceError(`${path}.default is not JSON-compatible`);
  if (type !== "json" && !matchesFlagType(type, value.default)) {
    throw new ManifestSourceError(`${path}.default does not match ${type}`);
  }
  const scope = value.scope;
  if (scope !== "cross-project") {
    throw new ManifestSourceError(`${path}.scope is invalid`);
  }
  if (value.rules !== undefined) {
    if (!Array.isArray(value.rules)) throw new ManifestSourceError(`${path}.rules must be an array`);
    value.rules.forEach((rule, index) => validateRule(rule, `${path}.rules[${index}]`));
  }
  if (value.killDate !== undefined && (typeof value.killDate !== "string" || !Number.isFinite(Date.parse(value.killDate)))) {
    throw new ManifestSourceError(`${path}.killDate must be an ISO date`);
  }
  return value as unknown as FlagSpec;
}

function validateRule(value: unknown, path: string): void {
  if (!isRecord(value)) throw new ManifestSourceError(`${path} must be an object`);
  if (value.value !== undefined && !isValidValue(value.value)) throw new ManifestSourceError(`${path}.value is not JSON-compatible`);
  if (value.variants !== undefined) {
    if (!Array.isArray(value.variants) || value.variants.length === 0) throw new ManifestSourceError(`${path}.variants must be a non-empty array`);
    for (const [index, variant] of value.variants.entries()) {
      if (!isRecord(variant) || typeof variant.key !== "string" || !Number.isFinite(variant.weight) || variant.weight < 0) {
        throw new ManifestSourceError(`${path}.variants[${index}] is invalid`);
      }
      if (variant.value !== undefined && !isValidValue(variant.value)) {
        throw new ManifestSourceError(`${path}.variants[${index}].value is not JSON-compatible`);
      }
    }
  }
  if (value.prereq !== undefined && !isRecord(value.prereq)) throw new ManifestSourceError(`${path}.prereq must be an object`);
  if (value.rollout !== undefined && !isRecord(value.rollout)) throw new ManifestSourceError(`${path}.rollout must be an object`);
  if (value.if !== undefined && !isRecord(value.if)) throw new ManifestSourceError(`${path}.if must be an object`);
}

function matchesFlagType(type: FlagSpec["type"], value: unknown): boolean {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return true;
}

function stringField(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new ManifestSourceError(`${path} must be a non-empty string`);
  return value;
}

function isValidValue(value: unknown): value is FlagValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isValidValue);
  return isRecord(value) && Object.values(value).every(isValidValue);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
