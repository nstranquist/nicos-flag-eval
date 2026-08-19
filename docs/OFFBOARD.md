# Flags extract offboard

Date: 2026-08-14
Updated: 2026-08-19
Status: Phase 0 engine and Phase 1 sanitized host are in this tree. Local
`make publish-ready` is the publication gate. Public remote:
`https://github.com/nstranquist/nicos-flag-eval`. Do not reuse or flip
`nstranquist/nicos-flags`. Catalog decision:
`docs/active/08-19-1011-nicos-flag-eval-public-extract/` in nicos-tools.

## 1. Decision

Extract the **portable evaluator** and a **sanitized demo host**. Keep the
**private operator instance** at `~/dev/nicos-flags`. Do not flip any
existing flags tree public. The public remote for this extract is
`nstranquist/nicos-flag-eval`. Do not extract the `ndev flags` command.
Do not rewrite the JavaScript toolchain in bun.

This repository (`~/tools/nicos-flag-eval`) holds the Go + TypeScript +
Swift evaluators, the synthetic demo catalog, OpenFeature, experiments, and
`host/`. It is a **new** local git repository. It is not a branch or
worktree of `nicos-tools` and not a visibility change of `~/dev/nicos-flags`.

## 2. Catalog ownership

`ndev ask` and catalog search selected **`ndev.flags`**, not
`product.nicos-flags`, as the system map.

| Catalog id | Kind | Role |
|---|---|---|
| `ndev.flags` | command / map | Universal feature-flag surface. Engine tests live under `nicos-tools/nicos-dev/internal/flags`. CLI: `ndev flags`. |
| `cli.flags-schemagen` | CLI | Codegen from the authored manifest into Go / TS / Swift bindings. Not a product. |
| `product.nicos-flags` | product | Cloudflare Pages host + Svelte console. `refs: invokes → ndev.flags`. Catalog entrypoint still `apps/nicos-flags`. |
| `flag.*` | inventory | Individual factory keys authored in `apps/_shared/flag-schemas/flags.manifest.json`. |
| web-app / endpoint / infra rows | deploy | Access-gated live host. |

There is **no** `package.flags` and **no** `capability.flags`. The engine was
never enrolled as extractable IP. The 2026-07-25 portfolio extraction ranking
scored Nicos Flags **58** and said **EXTRACT → PRIVATE**. That extract already
exists at `~/dev/nicos-flags` and still carries the factory plane.

`ndev catalog explain` was stale when this decision was taken. The claims
above come from catalog source markdown plus the 2026-05-18 design document
at `nicos-tools/nicos-dev/docs/active/05-18-flags-system-design.md`.

### What each name means

- **`ndev.flags` is the system.** One authored manifest, a GrowthBook-class
  evaluator, a five-tier resolver, overrides, audit, and codegen.
- **`product.nicos-flags` is the host.** The edge service that *hosts* that
  system. The product title “edge-hosted feature-flag evaluator” oversells
  it. The body is accurate: it hosts the universal `ndev flags` system.
- **`~/tools/nicos-flag-eval` is the portable engine.** The only slice that
  should ever become a public library without factory data.
- **`nicos-flags` is not a misnomer for the hosted service.** It *is* a
  misnomer if you treat that repo as the engine home or as a public product.

## 3. Why `~/dev/nicos-flags` must not be flipped public

That tree is a private product extract of the factory flag plane, not a
sanitized library.

It still contains:

- The authored factory catalog (`nicos.*`, `ndev.*`, `platform.*` keys).
- The synthesized built-in-gates compatibility dump (factory internal
  scope, sourced from `nicos-dev/internal/feature/gates.go`).
- Operator inbox addresses in Wrangler vars, plus Cloudflare Access team
  hostname and audience UUID.
- Proprietary `LICENSE`, `CONTRIBUTING`, `SECURITY` (“do not copy source
  to a public repository”), ADR 0001, `catalog.yaml` tags, and
  `.nicos/product.yaml` license: proprietary.

The live host is Access-gated. Recruiters cannot click it. Opening the
private remote as-is would publish unreleased factory surface area and
operator identity. That is a two-tree extract problem, not a polish
problem.

Do **not** sanitize in place. The factory instance must keep the factory
manifest.

## 4. Why not “open source all of it” under a new bun monorepo

“All of it” as currently assembled is three products glued to factory guts:

1. Engine — extractable (this repo).
2. Operator CLI — `ndev flags`. That *is* ndev. Never public.
3. Host + console — extractable later, after identity and catalog strip.
4. Factory catalog and Access identity — never public.

A new bun monorepo would be a **third copy** of code that already lives in
`nicos-tools` and `~/dev/nicos-flags`. Bun does not own Go or Swift. The
cataloged wedge is Go / TS / Swift FNV-1a parity. The JS side already runs
on pnpm + Vite + Wrangler + Node. Cloudflare Pages does not need bun.
Changing the JS runtime is a novelty, not a product.

Opening the whole control plane (approvals, stream, schedules, operator
console) gives away the only paid layer in a category you are not winning.
The internal rubric was 7.7 combined versus GrowthBook 8.9, control plane
6.7. Unleash, Flagsmith, and GrowthBook keep tenancy or hosted ops closed.
The catalog already prices this as internal infra with a latent
flat-versus-per-seat SaaS. MIT on the evaluator is a library. MIT on the
full operator plane is a company you did not decide to start.

Career timing is independent and currently against more personal public
volume: six 2026 showcase repos are already public and still not pinned;
applications are still zero. This extract is **not** a pin candidate this
quarter.

## 5. Factory versus portable layers

| Layer | Source | This repo |
|---|---|---|
| Pure evaluator (rules, predicates, rollouts, kill dates, variants, FNV-1a `Bucket`) | `nicos-tools/nicos-dev/internal/flags/engine.go` + `types.go` + `schema.go` | Copied, package `flageval` |
| Manifest load (segment inline, unknown-segment reject, variant weights, namespace range + overlap) | Factory `registry.go` `NewRegistryFromManifest` | Ported into `ParseManifest` / TS `prepareManifest` / Swift `prepareManifest` |
| TS runtime | `nicos-tools/apps/_shared/flag-schemas/runtime/evaluator.ts` | `ts/evaluator.ts` (no stream subscribe helper) |
| Swift runtime | `nicos-tools/apps/_shared/flag-schemas/runtime/Evaluator.swift` | `swift/Evaluator.swift` (includes `hashVersion` / namespace, which the factory Swift port omitted) |
| Schema + parity fixture | `apps/_shared/flag-schemas/{flags.schema.json,parity-fixture.json}` | `schemas/` (factory scopes stripped from schema) |
| Authored factory manifest | `apps/_shared/flag-schemas/flags.manifest.json` | **Omitted.** Replaced by `schemas/demo.manifest.json` |
| Built-in-gates wrap | `legacy_gates.go`, `internal/feature` | **Omitted.** Will not build as a public module |
| Store / overrides / sticky files / `~/.nicos-dev` | `store.go`, `overrides.go`, `sticky.go` | **Omitted.** Not the public API |
| Embedded factory `runtime.json` | `embedded.go` | **Omitted** |
| `ndev flags` CLI | `nicos-dev/cmd/ndev-go/flags.go` | **Omitted. Do not extract.** |
| Host, console, cron, stream, production Wrangler | `~/dev/nicos-flags` | **Phase 1 started.** Sanitized tree in `host/`. |
| OpenFeature provider | `packages/openfeature` in the private host | Ported to `packages/openfeature` on the demo catalog |
| Experiment assignment/stats | `packages/experiments` | Ported, provider-neutral, no factory keys |

The design document already deferred “future npm publication.” This repo is
that publication shape, still local.

## 6. Sanitize denylist (copy filter)

When copying **from** `~/dev/nicos-flags` or `nicos-tools` **into** this
tree, reject any file that contains factory operator leak surface.

Exact grep tokens and the operator-inbox / Access values live in the private
pointer `~/dev/nicos-flags/docs/flag-eval-extract.md` (kept out of this tree
on purpose so this extract stays clean). In this tree the rule is:

**Never author or copy:**

- Keys in the `nicos.*`, `ndev.*`, or `platform.*` namespaces.
- The synthesized built-in-gates compatibility JSON (factory internal
  scope dump).
- Wrangler vars that list operator inboxes.
- Cloudflare Access team hostname or audience UUID.
- The `ndev flags` CLI, personal/repo override paths, or the legacy
  gates wrap.
- Production Wrangler identity, factory catalog, or factory host names
  in the sanitized `host/` tree.

Parity fixture **seeds** such as `delivery-packet-v2` are hash inputs, not
factory keys. Keep the nine frozen tuples. Do not rename them.

## 7. Open-core versus full OSS

Recommended end state, **not** this goal:

- **Public (later, human-gated):** this evaluator, schema, parity fixture,
  synthetic examples, MIT. Optional OpenFeature provider once it sits on
  the synthetic catalog.
- **Private forever:** `ndev flags`, factory manifest, Access identity,
  operator inboxes, sticky/override file paths tied to the factory home
  directory.
- **Private until a real external buyer exists:** tenancy, billing,
  approvals as a product, experiment warehouse.

Do not put this extract on the job-search pin grid unless pins 1–3 already
show and this is filling a missing cloud/edge lane. Prefer one upstream
OpenFeature or Backstage contribution over a seventh personal pin.

Do not create or push a public remote until a human runs a secret scan and
re-runs the denylist grep. Portfolio extraction KEP P1 “same-day remote
push” does **not** apply. Objective is local git only.

## 8. Career timing

The 90-day career pack and the 2026-08-12 OSS recommendations say: do not
add more personal public volume this stretch. docs-puller, nicos-catalog,
openbook, agent-ops, hidden-menubar, and jobkit are the showcase set.
nicos-flags is not on that shortlist. June scorecard: Tier D, operator
infra. Catalog business: proprietary, low standalone moat, crowded
category.

This extract does not change that. It makes a later public library
possible without flipping the operator instance.

## 9. Phase 0 — engine (this goal)

Done when:

1. This document plus `PHASE-1-HOST.md` exist.
2. `~/tools/nicos-flag-eval` is a git repo with at least one local commit
   and no public remote.
3. Go `Evaluator.Evaluate` / `Bucket`, TS `evaluate` / `bucket`, and Swift
   `evaluate` / `bucket` ship here.
4. `schemas/demo.manifest.json` has only generic product keys
   (`checkout.*`, `search.*`).
5. `cmd/eval-demo` (and the TS / Swift example consumers) evaluate
   `checkout.promo-banner` for `user-alice` / `staging` through the shipped
   API.
6. All three languages match `schemas/parity-fixture.json`.
7. Denylist grep over this tree (excluding `.git`) is zero.

How to run:

```sh
cd ~/tools/nicos-flag-eval
make verify
```

## 10. Phase 1 — host + console (later)

Do **not** implement in this goal. Full file-level runbook:
[`PHASE-1-HOST.md`](PHASE-1-HOST.md).

Summary: start from `~/dev/nicos-flags`, copy into a **new** directory
under this repo or a sibling, strip identity and the factory catalog,
point the host at `schemas/demo.manifest.json`, keep pnpm/Wrangler/Node
(not bun), keep `~/dev/nicos-flags` as the private operator instance.

## 11. Thoughts that were not already in chat

- The Go store’s resolution order (process flag → env → personal override
  → repo override → rules → default) is **host policy**, not evaluator
  law. Do not reintroduce `~/.nicos-dev` paths as the public API.
- `flags-schemagen` can stay factory-side. This extract does not need
  codegen until a second consumer exists. Hand-written demo keys are
  enough.
- The OpenFeature server provider in `~/dev/nicos-flags/packages/openfeature`
  is a wrapper around the evaluator. Bring it in Phase 1 or 1.5, only
  after it evaluates the synthetic catalog. Do not copy Appendix B
  fixtures that mention factory keys.
- Experiment assignment (`packages/experiments`) is provider-neutral and
  could follow the evaluator. Warehouse + stats method stay private until
  there is an external consumer.
- Catalog enrollment uses `product.nicos-flag-eval`, license MIT, and is
  **not** showcase-ready. Do not add a GitHub remote from an agent session.
- `nicos-tools` must not be switched onto this module in this goal. A
  later parity check can compare `flageval.Bucket` to
  `nicos-dev/internal/flags.Bucket` on the same fixture.
- Slot-dock’s privacy-sanitized MIT extract and docs-puller’s two-tree
  discipline are the patterns. Do not invent a bun workspace because
  other extracts used pnpm or Go.
- A public demo host, if it ever exists, must be Access-free and must
  serve only the synthetic catalog. The current `pages.dev` host stays
  private.
- Do not delete `apps/nicos-flags` in the monorepo as part of this work.
  ADR 0001 already said a later digest-parity migration is a separate
  reviewed source-of-truth change.
- The nine parity tuples are the contract. If Go `hash/fnv` and the
  hand-rolled TS/Swift FNV-1a ever disagree, Go is the reference; fix
  the ports; do not “average” or re-derive expected values.
- Sticky bucketing, force lists, and cloud overrides belong to a host.
  The evaluator may keep the schema fields and ignore them.

## 12. Non-goals (still in force)

- Public GitHub create, visibility flip, or push.
- Rewriting or deleting `~/dev/nicos-flags`.
- Extracting `ndev flags`.
- Bun.
- Career pin or profile edits.
- Catalog enrollment as a public product.
- Changing nicos-tools to import this module.
