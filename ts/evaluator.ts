// Portable TypeScript port of the Go flageval engine.
//
// Stable across Go / TS / Swift: same FNV-1a 32-bit hash bucketing, same
// predicate combinators, same rule short-circuit, same kill-date semantics.

export type FlagType = "boolean" | "string" | "number" | "json";
export type Scope = "cross-project";

export type FlagValue = boolean | string | number | object | null;

export interface Rollout {
  seed: string;
  percentage: number;
  by: "user_id" | "project" | "env" | string;
}

export interface Predicate {
  env?: string;
  envs?: string[];
  project?: string;
  projects?: string[];
  userId?: string;
  userIdIn?: string[];
  attr?: Record<string, string>;
  constraints?: AttrConstraint[];
  all?: Predicate[];
  any?: Predicate[];
  not?: Predicate;
}

export interface AttrConstraint {
  attr: string;
  op:
    | "eq" | "ne"
    | "gt" | "gte" | "lt" | "lte"
    | "contains" | "starts_with" | "ends_with"
    | "regex"
    | "exists" | "not_exists"
    | "semver_gte" | "semver_lte";
  value?: string;
}

export interface Prereq {
  key: string;
  equals: FlagValue;
}

export interface Rule {
  description?: string;
  if?: Predicate;
  prereq?: Prereq;
  rollout?: Rollout;
  value?: FlagValue;
  variants?: Variant[];
  segment?: string;
}

export interface SegmentSpec {
  key: string;
  description?: string;
  predicate: Predicate;
}

export interface Variant {
  key: string;
  weight: number;
  value?: FlagValue;
}

export interface FlagSpec {
  key: string;
  type: FlagType;
  default: FlagValue;
  scope: Scope;
  owner?: string;
  description?: string;
  tags?: string[];
  exposedIn?: string[];
  envVar?: string;
  killDate?: string;
  killValue?: FlagValue;
  rules?: Rule[];
  force_include?: Record<string, FlagValue>;
  force_exclude?: string[];
  hashVersion?: number;
  stickyBucketing?: boolean;
  namespace?: string;
  namespaceRange?: [number, number];
  schema?: unknown;
}

export interface FlagsManifest {
  schemaVersion: number;
  flags: FlagSpec[];
  segments?: SegmentSpec[];
}

export interface EvalContext {
  userId?: string;
  env?: string;
  project?: string;
  attrs?: Record<string, string>;
  now?: Date;
  overrides?: Record<string, FlagValue>;
  processOverrides?: Record<string, FlagValue>;
}

export type EvalSource =
  | "process-flag"
  | "personal-override"
  | "repo-override"
  | "rule"
  | "kill-date"
  | "default"
  | "missing";

export interface EvalResult {
  key: string;
  value: FlagValue;
  source: EvalSource;
  reason: string;
  rule?: number;
  variant?: string;
  found: boolean;
}

export interface ExposureEvent {
  key: string;
  variant?: string;
  value: FlagValue;
  source: EvalSource;
  userId?: string;
  env?: string;
  project?: string;
  ts: string;
}

export function prepareManifest(manifest: FlagsManifest): FlagsManifest {
  const segments = new Map<string, Predicate>();
  for (const seg of manifest.segments ?? []) {
    if (!seg.key) throw new Error("flageval: segment missing key");
    if (segments.has(seg.key)) throw new Error(`flageval: duplicate segment key ${seg.key}`);
    segments.set(seg.key, seg.predicate);
  }
  const flags = manifest.flags.map((f) => {
    const rules = (f.rules ?? []).map((r, i) => {
      if (!r.segment) return { ...r };
      const pred = segments.get(r.segment);
      if (!pred) {
        throw new Error(`flageval: flag ${f.key} rule[${i}] references unknown segment ${r.segment}`);
      }
      const next: Rule = { ...r, segment: undefined };
      next.if = r.if ? { all: [r.if, pred] } : { ...pred };
      return next;
    });
    return { ...f, rules };
  });
  const byNS = new Map<string, Array<{ key: string; lo: number; hi: number }>>();
  for (const f of flags) {
    if (!f.namespace) continue;
    const range = f.namespaceRange ?? [0, 0];
    const [lo, hi] = range;
    if (lo < 0 || hi > 1 || lo >= hi) {
      throw new Error(`flageval: flag ${f.key} namespaceRange invalid`);
    }
    const list = byNS.get(f.namespace) ?? [];
    list.push({ key: f.key, lo, hi });
    byNS.set(f.namespace, list);
  }
  for (const [ns, spans] of byNS) {
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        if (spans[i].lo < spans[j].hi && spans[j].lo < spans[i].hi) {
          throw new Error(`flageval: namespace ${ns}: ${spans[i].key} overlaps ${spans[j].key}`);
        }
      }
    }
  }
  return { schemaVersion: manifest.schemaVersion, flags };
}

export class Evaluator {
  private byKey: Map<string, FlagSpec>;

  onExposure?: (event: ExposureEvent) => void;

  constructor(manifest: FlagsManifest) {
    const prepared = prepareManifest(manifest);
    this.byKey = new Map();
    for (const f of prepared.flags) {
      this.byKey.set(f.key, f);
    }
  }

  evaluate(key: string, ctx: EvalContext = {}): EvalResult {
    const res = this.evaluateInner(key, ctx, new Set());
    if (this.onExposure && res.found) {
      this.onExposure({
        key: res.key,
        variant: res.variant,
        value: res.value,
        source: res.source,
        userId: ctx.userId,
        env: ctx.env,
        project: ctx.project,
        ts: new Date().toISOString(),
      });
    }
    return res;
  }

  private evaluateInner(key: string, ctx: EvalContext, visiting: Set<string>): EvalResult {
    if (visiting.has(key)) {
      return { key, value: null, source: "missing", reason: "cyclic prerequisite", found: false };
    }
    const f = this.byKey.get(key);
    if (!f) {
      return { key, value: null, source: "missing", reason: "flag not registered", found: false };
    }
    visiting.add(key);
    if (ctx.processOverrides && key in ctx.processOverrides) {
      return {
        key, value: ctx.processOverrides[key], source: "process-flag",
        reason: "in-memory process override", found: true,
      };
    }
    if (ctx.overrides && key in ctx.overrides) {
      return {
        key, value: ctx.overrides[key], source: "personal-override",
        reason: "in-memory override", found: true,
      };
    }
    if (f.rules) {
      for (let i = 0; i < f.rules.length; i++) {
        const r = f.rules[i];
        if (!this.ruleMatches(f, r, ctx, visiting)) continue;
        let v: FlagValue = r.value !== undefined ? r.value : f.default;
        let variantKey: string | undefined;
        if (r.variants && r.variants.length > 0) {
          const picked = pickVariant(key, f.hashVersion ?? 0, i, r, ctx);
          variantKey = picked.key;
          v = picked.value !== undefined ? picked.value : f.default;
        }
        return {
          key, value: v, source: "rule",
          reason: ruleReason(r, i), rule: i + 1, variant: variantKey, found: true,
        };
      }
    }
    if (f.killDate && killDatePassed(f.killDate, ctx.now)) {
      const v = f.killValue !== undefined ? f.killValue : killZero(f.type);
      return { key, value: v, source: "kill-date", reason: `kill date ${f.killDate} passed`, found: true };
    }
    return { key, value: f.default, source: "default", reason: "no rule matched", found: true };
  }

  private ruleMatches(f: FlagSpec, r: Rule, ctx: EvalContext, visiting: Set<string>): boolean {
    if (r.if && !predicateMatches(r.if, ctx)) return false;
    if (r.prereq) {
      const got = this.evaluateInner(r.prereq.key, ctx, visiting);
      if (!got.found || !deepEqual(got.value, r.prereq.equals)) return false;
    }
    if (r.rollout && !rolloutHits(r.rollout, f.hashVersion ?? 0, ctx)) return false;
    if (f.namespace && !namespaceHits(f, ctx)) return false;
    return true;
  }
}

export function namespaceHits(f: FlagSpec, ctx: EvalContext): boolean {
  if (!ctx.userId) return false;
  const range = f.namespaceRange ?? [0, 1];
  const b = bucket("ns:" + (f.namespace ?? ""), ctx.userId) / 100.0;
  return b >= range[0] && b < range[1];
}

export function predicateMatches(p: Predicate, ctx: EvalContext): boolean {
  if (p.env !== undefined && p.env !== ctx.env) return false;
  if (p.envs && !p.envs.includes(ctx.env ?? "")) return false;
  if (p.project !== undefined && p.project !== ctx.project) return false;
  if (p.projects && !p.projects.includes(ctx.project ?? "")) return false;
  if (p.userId !== undefined && p.userId !== ctx.userId) return false;
  if (p.userIdIn && !p.userIdIn.includes(ctx.userId ?? "")) return false;
  if (p.attr) {
    for (const [k, v] of Object.entries(p.attr)) {
      if ((ctx.attrs ?? {})[k] !== v) return false;
    }
  }
  if (p.constraints) {
    for (const c of p.constraints) {
      if (!constraintMatches(c, ctx)) return false;
    }
  }
  if (p.all && !p.all.every((s) => predicateMatches(s, ctx))) return false;
  if (p.any && !p.any.some((s) => predicateMatches(s, ctx))) return false;
  if (p.not && predicateMatches(p.not, ctx)) return false;
  return true;
}

export function pickVariant(flagKey: string, hashVersion: number, ruleIdx: number, r: Rule, ctx: EvalContext): { key: string; value?: FlagValue } {
  const variants = r.variants ?? [];
  let seed: string;
  let attr: string;
  if (r.rollout && r.rollout.seed) {
    seed = r.rollout.seed;
    attr = rolloutAttr(r.rollout.by, ctx);
  } else {
    seed = flagKey + "|rule-" + ruleIdx;
    attr = ctx.userId ?? ctx.project ?? ctx.env ?? "";
  }
  if (hashVersion > 0) seed = seed + "|v" + hashVersion;
  const b = bucket(seed, attr);
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (b < cumulative) return { key: v.key, value: v.value };
  }
  const last = variants[variants.length - 1];
  return { key: last.key, value: last.value };
}

function rolloutAttr(by: string, ctx: EvalContext): string {
  switch (by) {
    case "user_id":
    case "userId":
    case "user":
      return ctx.userId ?? "";
    case "project":
      return ctx.project ?? "";
    case "env":
      return ctx.env ?? "";
    default:
      return (ctx.attrs ?? {})[by] ?? "";
  }
}

export function rolloutHits(r: Rollout, hashVersion: number, ctx: EvalContext): boolean {
  if (r.percentage <= 0) return false;
  if (r.percentage >= 100) return true;
  const attr = rolloutAttr(r.by, ctx);
  if (!attr) return false;
  let seed = r.seed;
  if (hashVersion > 0) seed = seed + "|v" + hashVersion;
  return bucket(seed, attr) < r.percentage;
}

/** FNV-1a 32-bit of `seed + "|" + attr`, modulo 100. Cross-language stable. */
export function bucket(seed: string, attr: string): number {
  const input = seed + "|" + attr;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash % 100;
}

function killDatePassed(killDate: string, now?: Date): boolean {
  const d = new Date(killDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const end = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  const wall = now ?? new Date();
  return wall.getTime() >= end.getTime();
}

function killZero(t: FlagType): FlagValue {
  switch (t) {
    case "boolean": return false;
    case "string": return "";
    case "number": return 0;
    default: return null;
  }
}

export function constraintMatches(c: AttrConstraint, ctx: EvalContext): boolean {
  const { value: lhs, present } = lookupAttr(c.attr, ctx);
  switch (c.op) {
    case "exists":     return present;
    case "not_exists": return !present;
    case "eq":         return lhs === (c.value ?? "");
    case "ne":         return lhs !== (c.value ?? "");
    case "contains":   return lhs.includes(c.value ?? "");
    case "starts_with":return lhs.startsWith(c.value ?? "");
    case "ends_with":  return lhs.endsWith(c.value ?? "");
    case "regex": {
      try { return new RegExp(c.value ?? "").test(lhs); }
      catch { return false; }
    }
    case "gt": case "gte": case "lt": case "lte": {
      const a = Number(lhs);
      const b = Number(c.value ?? "");
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      switch (c.op) {
        case "gt":  return a > b;
        case "gte": return a >= b;
        case "lt":  return a < b;
        case "lte": return a <= b;
      }
      return false;
    }
    case "semver_gte": return semverCompare(lhs, c.value ?? "") >= 0;
    case "semver_lte": return semverCompare(lhs, c.value ?? "") <= 0;
    default: return false;
  }
}

function lookupAttr(name: string, ctx: EvalContext): { value: string; present: boolean } {
  switch (name) {
    case "user_id":
    case "userId":
    case "user":
      return { value: ctx.userId ?? "", present: !!ctx.userId };
    case "env":
      return { value: ctx.env ?? "", present: !!ctx.env };
    case "project":
      return { value: ctx.project ?? "", present: !!ctx.project };
  }
  const a = ctx.attrs?.[name];
  if (a === undefined) return { value: "", present: false };
  return { value: a, present: true };
}

function semverCompare(a: string, b: string): number {
  const pa = semverSplit(a);
  const pb = semverSplit(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

function semverSplit(v: string): [number, number, number] {
  const parts = v.split(".");
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3 && i < parts.length; i++) {
    let seg = parts[i];
    for (let j = 0; j < seg.length; j++) {
      const ch = seg.charCodeAt(j);
      if (ch < 48 || ch > 57) { seg = seg.slice(0, j); break; }
    }
    if (seg === "") continue;
    const n = parseInt(seg, 10);
    if (!Number.isNaN(n)) out[i] = n;
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function ruleReason(r: Rule, idx: number): string {
  if (r.description) return `rule[${idx}]: ${r.description}`;
  if (r.rollout) return `rule[${idx}]: rollout ${r.rollout.percentage}% by ${r.rollout.by}`;
  if (r.if) return `rule[${idx}]: predicate matched`;
  if (r.prereq) return `rule[${idx}]: prereq ${r.prereq.key} satisfied`;
  return `rule[${idx}]: matched`;
}
