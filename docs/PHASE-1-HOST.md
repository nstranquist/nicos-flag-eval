# Phase 1 — sanitize and extract host + console

Status: first local extract is under `host/` (sanitized console, Functions,
demo runtime, workers, SQL). Still no public remote. Storybook was not
copied. Approvals/stream/Turso writes remain optional and unhosted.  
Owner of the source tree: `~/dev/nicos-flags` (private operator instance).  
Destination: a **new** directory. Never overwrite the operator instance.
Never add a public remote without a human.

This is the implementable runbook. Follow it in order.

## Preconditions

1. Phase 0 (`~/tools/nicos-flag-eval`) is green: `make verify`.
2. `~/dev/nicos-flags` still holds the factory catalog and Access-gated
   production host. Leave it that way.
3. You have read `docs/OFFBOARD.md` and the private pointer
   `~/dev/nicos-flags/docs/flag-eval-extract.md`.
4. You will keep pnpm + Node + Wrangler. Do not introduce bun.

## Destination shape

Prefer adding packages under this repo rather than a third standalone
root:

```
~/tools/nicos-flag-eval/          # already exists (engine)
  host/                           # NEW — Pages app + Functions
  console/                        # NEW — Svelte operator UI (or host/src)
  workers/cron/
  workers/stream/
```

A sibling `~/tools/nicos-flags-host` is acceptable if the host’s Node
workspace would drown the Go module. Either way: **new git history or a
new commit series in this repo**, not `git filter-branch` of the private
remote.

## Copy filter

Copy these from `~/dev/nicos-flags` only after the sanitize steps below
succeed on a staging directory:

| Copy | After sanitize |
|---|---|
| `src/` Svelte console | Strip factory key examples, operator emails, Access copy |
| `functions/` Pages API | Strip Access team/AUD, inbox vars, factory manifest embed |
| `functions/_lib/host.ts` | Rewrite canonical-host allowlist; no factory `pages.dev` hostname |
| `worker-cron/` wrangler + source | Strip service-token comments and the production Pages URL env var |
| `worker-stream/` wrangler + source | Strip publish-secret docs that name production URLs |
| `sql/` migrations | Schema only. No data dumps |
| `packages/openfeature/` | Point at this repo’s evaluator + demo manifest |
| `package.json` scripts that are host-local | Keep `dev` / `build`; drop `ship` until a demo account exists |
| Storybook stories | Keep only generic checkout/search flags |

**Do not copy:**

| Path | Why |
|---|---|
| `packages/runtime/flags.manifest.json` | Factory catalog |
| `packages/runtime/compatibility/` | Built-in-gates dump |
| `packages/runtime/generated/` | Generated factory bindings (`flags.ts`, Swift bindings, runtime JSON) |
| `functions/_runtime/flags.runtime.json` | Generated factory runtime |
| `catalog.yaml`, `.nicos/product.yaml` | Proprietary product metadata |
| `packages/experiments/` | Experiment warehouse until it sits on the synthetic catalog |
| `docs/deployment-security.md` | Names the private host and Access policy |
| Production `wrangler.toml` `[vars]` identity | Inboxes, Access hostname, audience UUID |
| `.dev.vars`, dashboard secret names with real values | Secrets |
| `docs/evidence/*` that cite private release URLs as public proof | Operator receipts |
| LICENSE that says proprietary | Host extract should MIT-match this repo or stay unpublished |
| Any file that fails the denylist grep in the private pointer |

## Sanitize steps (do these in a staging dir before commit)

1. Replace every authored catalog with
   `~/tools/nicos-flag-eval/schemas/demo.manifest.json` (or a copy).
   Regenerate any `flags.runtime.json` from that file only.
2. Delete the compatibility dump for factory internal gates.
3. Rewrite Wrangler:
   - `name` can stay a demo name (`flag-eval-demo`).
   - Remove operator inbox vars entirely. Local dev uses an explicit
     `DEV_ADMIN_EMAIL` in ignored `.dev.vars` only.
   - Remove Access team hostname and audience UUID. A public demo host
     is Access-free. A private staging host may use Access, but those
     values stay in the dashboard, never in git.
   - Keep the immutable-deployment host guard idea; allow only
     `localhost` and a documented demo hostname.
4. Grep the staging tree for the tokens listed in
   `~/dev/nicos-flags/docs/flag-eval-extract.md`. That private list
   includes operator inboxes, the Access team hostname, the Access
   audience UUID, the factory Pages hostname, and the cron Pages URL
   env var. Zero matches required. Do not copy those tokens into this
   extract.
5. Point TypeScript imports at `../../ts/evaluator.ts` (this repo) or a
   built package of `flageval`. Do not vendor a second evaluator.
6. Drop `subscribe()` wiring that assumes the factory stream Worker URL.
   Demo stream, if any, uses a local Wrangler service binding.
7. Replace README / SUPPORT / SECURITY “proprietary, do not copy” with
   this repo’s MIT + “no public push until human review.”
8. Do not copy `ADMIN` identity comments that name personal inboxes.
   Rewrite as “editor emails come from the environment, never git.”
9. Turso: schema from `sql/` is fine. Connection URL and auth token stay
   dashboard secrets. Seed only synthetic rows (`checkout.promo-banner`).
10. Cron / stream workers: keep the protocol. Change project names. Do
    not commit `STREAM_PUBLISH_SECRET`.
11. Console copy: resolution-chain and audit views may stay. Any screenshot
    or story that shows a factory key is rewritten to `checkout.*`.
12. Run `pnpm` (not bun) install + typecheck + the host’s unit tests +
    this repo’s `make verify`.

## Dual-tree after Phase 1

| Tree | Catalog | Host | Public? |
|---|---|---|---|
| `~/dev/nicos-flags` | Factory keys | Access-gated production | No |
| `~/tools/nicos-flag-eval` | Demo keys | Optional Access-free demo | Not until human push |
| `nicos-tools` `ndev flags` | Factory keys via `apps/_shared/flag-schemas` | None | No |

A later monorepo migration may point `ndev flags` at this Go module for
the pure evaluator only. That is a reviewed source-of-truth change with
digest parity. It is not part of Phase 1.

## Open-core split at Phase 1

If the host is extracted into this repo:

- Evaluator + demo host README = the public story later.
- Approvals, scheduled changes, stream fanout, exposure sink, and Turso
  operator writes may ship in the extract **disabled by default** or live
  only in the private instance until tenancy exists.
- Do not advertise multi-tenant billing.

## Verification for a future Phase 1 agent

1. Denylist grep clean on the new host files.
2. `make verify` still green (engine).
3. Host `pnpm` tests pass against the demo catalog.
4. `git remote -v` still has no public origin unless a human added one.
5. `~/dev/nicos-flags` factory manifest is unchanged.
6. No runnable copy of production Wrangler identity exists in git.

## Out of scope even in Phase 1

- Extracting `ndev flags`.
- Pushing GitHub.
- Bun.
- Switching nicos-tools onto this module.
- Catalog showcase / pin changes.
