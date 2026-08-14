import manifestJson from "../_runtime/flags.runtime.json" with { type: "json" };

type ManifestFlag = { key: string; type: string; scope: string };
const flags = manifestJson as { flags: ManifestFlag[] };

export function flagDefinition(key: string): ManifestFlag | undefined {
  return flags.flags.find((flag) => flag.key === key);
}

export function isRegisteredFlag(key: string): boolean {
  return Boolean(flagDefinition(key));
}

const forceScopes = new Set(["force-include", "force-exclude"]);

// Force-list storage keys are `<flagKey>:<userId>`. Cloud overrides use
// the flag key alone. Return the registered flag key, or null.
export function registeredOverrideFlag(scope: string, storageKey: string): string | null {
  if (forceScopes.has(scope)) {
    const idx = storageKey.lastIndexOf(":");
    if (idx <= 0 || idx === storageKey.length - 1) return null;
    const flagKey = storageKey.slice(0, idx);
    return flagDefinition(flagKey) ? flagKey : null;
  }
  return flagDefinition(storageKey) ? storageKey : null;
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
