// Display helpers shared by all components.

import type { EvalSource, FlagSpec } from "./api";

export function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

export function sourceColor(source: EvalSource): { bg: string; fg: string; ring: string } {
  switch (source) {
    case "rule":
      return { bg: "rgba(110, 231, 183, 0.12)", fg: "#6ee7b7", ring: "#6ee7b7" };
    case "default":
      return { bg: "rgba(138, 146, 166, 0.12)", fg: "#8a92a6", ring: "#8a92a6" };
    case "env":
    case "personal-override":
    case "repo-override":
    case "cloud-override":
      return { bg: "rgba(252, 211, 77, 0.12)", fg: "#fcd34d", ring: "#fcd34d" };
    case "sticky-bucket":
      return { bg: "rgba(168, 85, 247, 0.14)", fg: "#c4b5fd", ring: "#a855f7" };
    case "force-include":
    case "force-exclude":
      return { bg: "rgba(96, 165, 250, 0.14)", fg: "#93c5fd", ring: "#60a5fa" };
    case "kill-date":
    case "missing":
      return { bg: "rgba(248, 113, 113, 0.14)", fg: "#fca5a5", ring: "#f87171" };
    case "legacy-gate":
      return { bg: "rgba(251, 146, 60, 0.14)", fg: "#fdba74", ring: "#fb923c" };
    default:
      return { bg: "rgba(255,255,255,0.08)", fg: "#e6e8ee", ring: "#666" };
  }
}

export function scopeIcon(scope: string): string {
  if (scope === "cross-project") return "◆";
  return "◇";
}

export function isOn(value: unknown): boolean {
  return value === true || value === "true";
}

export function flagSummary(f: FlagSpec): string {
  const bits: string[] = [];
  if (f.rules?.length) bits.push(`${f.rules.length} rule${f.rules.length === 1 ? "" : "s"}`);
  if (f.namespace) bits.push(`ns:${f.namespace}`);
  if (f.stickyBucketing) bits.push("sticky");
  if (f.killDate) bits.push(`kill:${f.killDate}`);
  if (f.hashVersion) bits.push(`v${f.hashVersion}`);
  if (f.force_include && Object.keys(f.force_include).length)
    bits.push(`+${Object.keys(f.force_include).length}`);
  if (f.force_exclude?.length) bits.push(`−${f.force_exclude.length}`);
  return bits.join("  ·  ");
}
