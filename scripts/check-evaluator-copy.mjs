#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Evaluator } from "../ts/evaluator.ts";
import { Evaluator as HostEvaluator } from "../host/functions/_runtime/evaluator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "ts/evaluator.ts"), "utf8");
const copy = readFileSync(join(root, "host/functions/_runtime/evaluator.ts"), "utf8");
if (src !== copy) {
  throw new Error("host/functions/_runtime/evaluator.ts drifted from ts/evaluator.ts");
}

const demo = JSON.parse(readFileSync(join(root, "schemas/demo.manifest.json"), "utf8"));
const ev = new HostEvaluator(demo);
const got = ev.evaluate("checkout.promo-banner", { userId: "user-alice", env: "staging" });
if (got.source !== "rule" || got.value !== true) {
  throw new Error(`host evaluator copy failed demo eval: ${JSON.stringify(got)}`);
}
const same = new Evaluator(demo).evaluate("checkout.promo-banner", { userId: "user-alice", env: "staging" });
if (same.value !== got.value || same.source !== got.source) {
  throw new Error("host evaluator copy disagreed with ts/evaluator.ts");
}
console.log("evaluator copy ok");
