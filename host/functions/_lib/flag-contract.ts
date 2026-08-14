import manifestJson from "../_runtime/flags.runtime.json";

type ManifestFlag = { key: string; type: string; scope: string };
const flags = manifestJson as { flags: ManifestFlag[] };

export function flagDefinition(key: string): ManifestFlag | undefined {
  return flags.flags.find((flag) => flag.key === key);
}

export function isRegisteredFlag(key: string): boolean {
  return Boolean(flagDefinition(key));
}

export function parseStoredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function encodedValue(value: unknown): string {
  return JSON.stringify(value);
}
