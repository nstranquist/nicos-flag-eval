# Changelog

## [0.1.2] - 2026-08-14

- Pop the prereq visiting stack so sibling and diamond rules evaluate.
- Validate variant weights and namespace overlap in TypeScript and Swift.
- Land a sanitized demo host under `host/` (console, Functions, workers, SQL).
- Keep Storybook, factory catalog, and production identity out of the extract.

## [0.1.1] - 2026-08-14

- Inline named segments at manifest load; reject unknown segment refs.
- Fail closed on cyclic prerequisites in Go, TypeScript, and Swift.
- Teach Swift `hashVersion` and namespace gating so all three languages
  honor the extract schema.
- Validate variant weights, namespace ranges, and overlapping namespaces
  at load.
- Make `make verify` fail when `swiftc` is missing (`VERIFY_REQUIRE_SWIFT=1`).
- Expand the Phase 1 denylist and do-not-copy list.

## [0.1.0] - 2026-08-14

- Extract the portable Go / TypeScript / Swift evaluators into a new local
  repository.
- Ship a synthetic demo catalog and the frozen nine-tuple parity fixture.
- Document Phase 0 (engine) and Phase 1 (host + console later).
- No public remote.
