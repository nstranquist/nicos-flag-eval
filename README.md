# nicos-flag-eval

Portable feature-flag evaluator with deterministic Go / TypeScript / Swift
parity. Library first. Not the factory operator plane.

This is a **local extract**. Do not add a public remote. The private host
remains `~/dev/nicos-flags`. The system remains `ndev.flags`. Read
[`docs/OFFBOARD.md`](docs/OFFBOARD.md) before changing anything.

## What this is

- Pure evaluator: predicates, rollouts, prerequisites, variants, kill dates.
- `Bucket(seed, attr)` — FNV-1a 32-bit modulo 100, frozen by
  `schemas/parity-fixture.json`.
- Synthetic demo catalog only (`checkout.*`, `search.*`).
- Consumers: `cmd/eval-demo` (Go), `examples/eval-demo.mjs` (TS),
  `examples/EvalDemo.swift`.

## What this is not

- Not `ndev flags`.
- Not a visibility flip of `~/dev/nicos-flags`.
- Not a bun rewrite.
- Not the Pages host, Turso control plane, or Svelte console. Those are
  Phase 1: [`docs/PHASE-1-HOST.md`](docs/PHASE-1-HOST.md).

## Quick start

Need Go 1.22+, Node 22+ (for `--experimental-strip-types`), and a Swift
toolchain. `make verify` fails if `swiftc` is missing; set
`VERIFY_REQUIRE_SWIFT=0` only when you intentionally skip Swift.

```sh
make verify
make demo
```

Evaluate one synthetic flag through the shipped Go API:

```sh
go run ./cmd/eval-demo
```

Expected line (value and source must be non-empty):

```
key=checkout.promo-banner value=true source=rule
```

TypeScript:

```sh
node --experimental-strip-types examples/eval-demo.mjs
```

## Layout

| Path | Role |
|---|---|
| `engine.go`, `types.go`, `manifest.go` | Go library (`flageval`) |
| `ts/evaluator.ts` | TypeScript port |
| `swift/Evaluator.swift` | Swift port |
| `schemas/demo.manifest.json` | Synthetic catalog |
| `schemas/parity-fixture.json` | Nine frozen bucket tuples |
| `docs/OFFBOARD.md` | Full decision + implementable spec |
| `docs/PHASE-1-HOST.md` | Later host/console sanitize |

## License

MIT. Publication is still a human decision. See
[`docs/REMOTE-POLICY.md`](docs/REMOTE-POLICY.md).
