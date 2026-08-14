SHELL := /bin/bash
ROOT := $(abspath .)
VERIFY_REQUIRE_SWIFT ?= 1

.PHONY: test test-go test-ts test-swift parity demo verify fmt require-swift host-check packages-check

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

host-check:
	node --test --experimental-strip-types host/functions/_lib/host.test.ts host/scripts/evaluate-demo.test.mjs
	node scripts/check-stories.mjs
	@if [ -x host/node_modules/.bin/tsc ]; then \
		host/node_modules/.bin/tsc -p host/functions/tsconfig.json --noEmit; \
	else \
		echo "host typescript not installed; skipped functions typecheck"; \
	fi

packages-check:
	node --test --experimental-strip-types packages/experiments/assignment.test.ts
	pnpm --dir packages/openfeature test

verify: fmt test parity demo host-check packages-check
	@echo "verify ok"
