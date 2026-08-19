# Product law — nicos-flag-eval

This file is the portable copy of `recipe.nicos-flag-eval` (ADR-0008).
When the recipe and this file disagree, the recipe in nicos-tools wins
for factory work. This file wins for a stranger who only has this repo.

## Persona

A developer who needs deterministic feature flags in Go, TypeScript, or
Swift without a hosted vendor or the factory `ndev.flags` plane.

## Job to be done

Clone one public tree, boot a local demo host, and evaluate a synthetic
flag through the same evaluator the CLI uses.

## Problem

An evaluator-only extract proves hash parity. It does not show a flags
product. The private `nicos-flags` host cannot be the public demo.

## Goals

- One command starts the sanitized host on loopback.
- `POST /api/evaluate` for `checkout.promo-banner` / `user-alice` /
  `staging` returns `value=true` `source=rule`.
- The host catalog is `schemas/demo.manifest.json` only.

## Non-goals

- Public `nstranquist/nicos-flags`
- `ndev flags`, factory keys, Access, Turso identity
- Multi-tenant SaaS or a hiring pin
- npm publish in this slice

## Constraints

- Keys `nicos.*`, `ndev.*`, and `platform.*` fail closed.
- Host allowlist is loopback only.
- No required cloud account.

## Acceptance

1. `make host-check` is green.
2. `make host-demo-smoke` is green.
3. `make denylist` is green.
4. README leads with `make host-demo`, not “library first, host is not a public deploy.”
