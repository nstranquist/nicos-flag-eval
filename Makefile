SHELL := /bin/bash
ROOT := $(abspath .)

.PHONY: test test-go test-ts parity demo verify fmt

test: test-go test-ts

test-go:
	go test ./...

test-ts:
	node --test --experimental-strip-types ts/evaluator.test.ts

parity:
	go run ./cmd/parity
	node --experimental-strip-types examples/parity.mjs
	@if command -v swiftc >/dev/null 2>&1; then \
		swiftc -parse-as-library swift/Evaluator.swift examples/Parity.swift -o $(ROOT)/swift-parity && \
		$(ROOT)/swift-parity $(ROOT); \
	else \
		echo "swiftc not available; skipped Swift parity"; \
	fi

demo:
	go run ./cmd/eval-demo
	node --experimental-strip-types examples/eval-demo.mjs
	@if command -v swiftc >/dev/null 2>&1; then \
		swiftc -parse-as-library swift/Evaluator.swift examples/EvalDemo.swift -o $(ROOT)/swift-eval-demo && \
		$(ROOT)/swift-eval-demo $(ROOT); \
	else \
		echo "swiftc not available; skipped Swift demo"; \
	fi

fmt:
	gofmt -w *.go cmd/eval-demo/main.go cmd/parity/main.go

verify: fmt test parity demo
	@echo "verify ok"
