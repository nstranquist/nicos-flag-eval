SHELL := /bin/bash
ROOT := $(abspath .)
VERIFY_REQUIRE_SWIFT ?= 1

.PHONY: test test-go test-ts test-swift parity demo verify fmt require-swift host-deps host-check host-demo host-demo-smoke packages-check denylist secret-scan publish-ready

test: test-go test-ts test-swift

test-go:
	go test ./...

test-ts:
	node --test --experimental-strip-types ts/evaluator.test.ts

require-swift:
	@if ! command -v swiftc >/dev/null 2>&1; then \
		if [ "$(VERIFY_REQUIRE_SWIFT)" = "1" ]; then \
			echo "swiftc is required for three-language verify; set VERIFY_REQUIRE_SWIFT=0 to skip"; \
			exit 1; \
		fi; \
		echo "swiftc not available; Swift checks skipped"; \
		exit 0; \
	fi

test-swift: require-swift
	@if command -v swiftc >/dev/null 2>&1; then \
		swiftc -parse-as-library swift/Evaluator.swift examples/Contract.swift -o $(ROOT)/swift-contract && \
		$(ROOT)/swift-contract $(ROOT); \
	fi

parity: require-swift
	go run ./cmd/parity
	node --experimental-strip-types examples/parity.mjs
	@if command -v swiftc >/dev/null 2>&1; then \
		swiftc -parse-as-library swift/Evaluator.swift examples/Parity.swift -o $(ROOT)/swift-parity && \
		$(ROOT)/swift-parity $(ROOT); \
	fi

demo: require-swift
	go run ./cmd/eval-demo
	node --experimental-strip-types examples/eval-demo.mjs
	@if command -v swiftc >/dev/null 2>&1; then \
		swiftc -parse-as-library swift/Evaluator.swift examples/EvalDemo.swift -o $(ROOT)/swift-eval-demo && \
		$(ROOT)/swift-eval-demo $(ROOT); \
	fi

fmt:
	gofmt -w *.go cmd/eval-demo/main.go cmd/parity/main.go

host-deps:
	@if [ ! -d host/node_modules/@libsql/client ]; then \
		pnpm --dir host install --frozen-lockfile --ignore-scripts; \
	fi

host-check: host-deps
	node --test --experimental-strip-types \
		host/functions/_lib/host.test.ts \
		host/functions/_lib/flag-contract.test.ts \
		host/functions/api/evaluate.test.ts \
		host/functions/api/public-reads.test.ts \
		host/functions/api/overrides/write.test.ts \
		host/scripts/evaluate-demo.test.mjs
	node --experimental-strip-types scripts/check-evaluator-copy.mjs
	node scripts/check-stories.mjs
	@if [ -x host/node_modules/.bin/tsc ]; then \
		host/node_modules/.bin/tsc -p host/functions/tsconfig.json --noEmit; \
	else \
		echo "host typescript not installed; skipped functions typecheck"; \
	fi

host-demo: host-deps
	node host/scripts/prepare-runtime.mjs
	cd host && ./node_modules/.bin/vite build
	@echo "Demo host on http://127.0.0.1:8788"
	@echo "Evaluate: curl -sS http://127.0.0.1:8788/api/evaluate -H 'content-type: application/json' -d '{\"key\":\"checkout.promo-banner\",\"ctx\":{\"userId\":\"user-alice\",\"env\":\"staging\"}}'"
	cd host && ./node_modules/.bin/wrangler pages dev dist --ip 127.0.0.1 --port 8788 --persist-to .wrangler-demo

host-demo-smoke: host-deps
	node --experimental-strip-types scripts/host-demo-smoke.mjs

packages-check:
	node --test --experimental-strip-types packages/experiments/assignment.test.ts
	pnpm --dir packages/openfeature test

denylist:
	node --experimental-strip-types scripts/check-denylist.mjs

secret-scan:
	@command -v gitleaks >/dev/null 2>&1 || { echo "gitleaks is required for publish-ready" >&2; exit 1; }
	gitleaks git --redact --no-banner .
	gitleaks dir . --no-banner --redact

verify: fmt test parity demo host-check packages-check denylist
	@echo "verify ok"

publish-ready: verify secret-scan
	@echo "publish-ready: ok (local gate; no remote created)"
