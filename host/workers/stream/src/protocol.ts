export type LiveStreamEvent = {
  id: number;
  action: string;
  scope: string;
  env: string;
  key: string;
  value?: unknown;
  prev?: unknown;
  ts: string;
};

export function streamTag(envName: string): string {
  return `env:${environmentName(envName)}`;
}

export function environmentName(value: string | null | undefined): string {
  const name = value?.trim() || "default";
  if (name.length > 128 || /[^a-zA-Z0-9._:-]/u.test(name)) throw new Error("invalid environment");
  return name;
}

export function parseLiveStreamEvent(value: unknown): LiveStreamEvent {
  if (!isRecord(value)) throw new Error("event must be an object");
  if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0) throw new Error("event id must be a positive integer");
  for (const field of ["action", "scope", "env", "key", "ts"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) throw new Error(`event ${field} is required`);
  }
  if (!Number.isFinite(Date.parse(value.ts))) throw new Error("event ts must be an ISO timestamp");
  if (value.value !== undefined && !isJsonValue(value.value)) throw new Error("event value must be JSON-compatible");
  if (value.prev !== undefined && !isJsonValue(value.prev)) throw new Error("event prev must be JSON-compatible");
  return value as LiveStreamEvent;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
