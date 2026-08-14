import type { AuditEvent, EvalResult, FlagSpec } from "../api";

export const promoFlag: FlagSpec = {
  key: "checkout.promo-banner",
  type: "boolean",
  scope: "cross-project",
  default: false,
  description: "Show the seasonal checkout banner.",
  owner: "demo",
  rules: [{ if: { env: "staging" }, value: true }],
};

export const shippingFlag: FlagSpec = {
  key: "checkout.free-shipping-threshold",
  type: "number",
  scope: "cross-project",
  default: 50,
  description: "Cart total that unlocks free shipping.",
  owner: "demo",
};

export const rankingFlag: FlagSpec = {
  key: "search.ranking-variant",
  type: "string",
  scope: "cross-project",
  default: "control",
  description: "Search ranking experiment arm.",
  owner: "demo",
};

export const promoOff: EvalResult = {
  ok: true,
  key: promoFlag.key,
  value: false,
  source: "default",
  reason: "no rule matched",
  found: true,
};

export const promoOn: EvalResult = {
  ok: true,
  key: promoFlag.key,
  value: true,
  source: "rule",
  reason: "rule matched",
  rule: 1,
  found: true,
};

export const promoOverride: EvalResult = {
  ok: true,
  key: promoFlag.key,
  value: true,
  source: "cloud-override",
  reason: "set via dashboard",
  found: true,
};

export const rankingResult: EvalResult = {
  ok: true,
  key: rankingFlag.key,
  value: "rerank-v2",
  source: "rule",
  reason: "weighted ranking arms",
  variant: "rerank-v2",
  found: true,
};

export function demoAudit(key: string): AuditEvent[] {
  return [
    {
      id: 2,
      ts: "2026-08-14T12:00:00Z",
      action: "set",
      scope: "cloud",
      env: "staging",
      key,
      value: "true",
      prev: "false",
      actor: "editor@example.com",
      reason: "enable staging banner",
    },
    {
      id: 1,
      ts: "2026-08-13T12:00:00Z",
      action: "clear",
      scope: "cloud",
      env: "production",
      key,
      value: null,
      prev: "true",
      actor: "reviewer@example.com",
      reason: "rollback",
    },
  ];
}
