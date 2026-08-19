# nicos-flag-eval

Portable feature-flag evaluator with deterministic Go / TypeScript / Swift
parity. Library first. Not the factory operator plane.

Public source: https://github.com/nstranquist/nicos-flag-eval

This is the portable evaluator extract. The private host remains
`~/dev/nicos-flags`. The system remains `ndev.flags`. Do not flip
`nstranquist/nicos-flags` public. Read [`docs/OFFBOARD.md`](docs/OFFBOARD.md)
before changing anything.

## What this is

- Pure evaluator: predicates, rollouts, prerequisites, variants, kill dates.
- `Bucket(seed, attr)` — FNV-1a 32-bit modulo 100, frozen by
  `schemas/parity-fixture.json`.
- Synthetic demo catalog only (`checkout.*`, `search.*`).
- Consumers: `cmd/eval-demo` (Go), `examples/eval-demo.mjs` (TS),
  `examples/EvalDemo.swift`.

## What this is not

- Not `ndev flags`, a visibility flip of `~/dev/nicos-flags`, or a bun rewrite.
- Not a production deploy. `make host-demo` is the local run path.

## Install

Need Go 1.22+, Node 22+, and pnpm. Swift is required only for
three-language `make verify`.

```sh
git clone https://github.com/nstranquist/nicos-flag-eval.git
cd nicos-flag-eval
make host-check
```

## Quick start

Boot the sanitized demo host (console + evaluate API) on loopback:

```sh
make host-demo
```

Then open http://127.0.0.1:8788 or:

```sh
curl -sS http://127.0.0.1:8788/api/evaluate \
  -H 'content-type: application/json' \
  -d '{"key":"checkout.promo-banner","ctx":{"userId":"user-alice","env":"staging"}}'
```

Expected JSON includes `"value":true` and `"source":"rule"`.

`make host-demo-smoke` boots that host, checks the same evaluate call, and
stops. Product law is in [`PRODUCT.md`](PRODUCT.md).

Language CLIs (no host) still work:

```sh
make demo
```

Expected CLI line:

```
key=checkout.promo-banner value=true source=rule
```

## Usage

Evaluate one flag through the shipped Go API:

```go
manifest, err := flageval.ParseManifest(data)
if err != nil {
    log.Fatal(err)
}
result := manifest.Evaluate("checkout.promo-banner", flageval.Context{
    UserID: "user-alice",
    Env:    "staging",
})
fmt.Println(result.Value, result.Source)
```

TypeScript:

```ts
import { Evaluator } from "./ts/evaluator.ts";
const ev = new Evaluator(demoManifest);
const result = ev.evaluate("checkout.promo-banner", {
  userId: "user-alice",
  env: "staging",
});
```

OpenFeature: `packages/openfeature` with `schemas/demo.manifest.json`.

## Configuration

The evaluator has no process env and no `~/.nicos-dev` paths. Pass a
manifest. The demo catalog is `schemas/demo.manifest.json`. Host secrets
stay in ignored `.dev.vars` and the Cloudflare dashboard.

## API

| Symbol | Language | Role |
|---|---|---|
| `Evaluator.Evaluate` / `evaluate` | Go / TS / Swift | Rule chain, kill dates, variants, prerequisites |
| `Bucket` / `bucket` | Go / TS / Swift | FNV-1a 32-bit modulo 100 |
| `ParseManifest` / `prepareManifest` | Go / TS / Swift | Load, inline segments, reject overlap |

Go is the bucket reference. Frozen tuples live in
`schemas/parity-fixture.json`.

## Architecture

Pure evaluator, no disk, no env, no `~/.nicos-dev` paths. `ParseManifest`
inlines named segments and rejects unknown refs, weight errors, and
namespace overlap. `Evaluate` walks rules, kill dates, variants, and
prerequisites. `Bucket` is FNV-1a 32-bit modulo 100. The Go implementation
is the reference; TypeScript and Swift must match the fixture.

The sanitized demo host in `host/` is an optional Pages console over the
same evaluator. It is not the factory Access-gated instance.

## Layout

| Path | Role |
|---|---|
| `engine.go`, `types.go`, `manifest.go` | Go library (`flageval`) |
| `ts/evaluator.ts` | TypeScript port |
| `swift/Evaluator.swift` | Swift port |
| `schemas/demo.manifest.json` | Synthetic catalog |
| `schemas/parity-fixture.json` | Nine frozen bucket tuples |
| `docs/OFFBOARD.md` | Full decision + implementable spec |
| `host/` | Sanitized demo Pages + console |
| `docs/PHASE-1-HOST.md` | Host extract runbook |

## OpenFeature and experiments

`packages/openfeature` is a server provider over this evaluator. Pass
`schemas/demo.manifest.json`. `packages/experiments` is assignment/stats
only.

## Demo host (Phase 1)

Sanitized Pages + Svelte console lives in `host/`. It evaluates
`schemas/demo.manifest.json` only. `make host-demo` is the local run
path. Do not deploy to the private `nicos-flags` Pages project.

## Troubleshooting

- `make verify` asks for `swiftc`: install a Swift toolchain, or set
  `VERIFY_REQUIRE_SWIFT=0` only when you mean to skip Swift.
- Host Functions typecheck skipped: run `pnpm --dir host install`.
- OpenFeature tests fail on missing SDK: run
  `pnpm --dir packages/openfeature install --frozen-lockfile`.
- Denylist fails: a factory token leaked. Do not commit it. See
  `docs/OFFBOARD.md`.

## License

MIT. Publication is still a human decision. `make publish-ready` is the
local gate. It does not create remotes. See
[`docs/REMOTE-POLICY.md`](docs/REMOTE-POLICY.md).
