import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Evaluator } from "../../ts/evaluator.ts";

const extractRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const hostRuntime = join(extractRoot, "host/functions/_runtime/flags.runtime.json");
const demo = join(extractRoot, "schemas/demo.manifest.json");

test("host runtime is the synthetic demo catalog", () => {
  const hosted = JSON.parse(readFileSync(hostRuntime, "utf8"));
  const source = JSON.parse(readFileSync(demo, "utf8"));
  assert.deepEqual(
    hosted.flags.map((f) => f.key).sort(),
    source.flags.map((f) => f.key).sort(),
  );
  assert.ok(hosted.flags.every((f) => !f.key.startsWith("nicos.") && !f.key.startsWith("ndev.")));
});

test("demo evaluate through the shipped extractor", () => {
  const manifest = JSON.parse(readFileSync(hostRuntime, "utf8"));
  const ev = new Evaluator(manifest);
  const got = ev.evaluate("checkout.promo-banner", {
    userId: "user-alice",
    env: "staging",
  });
  assert.equal(got.found, true);
  assert.equal(got.source, "rule");
  assert.equal(got.value, true);
});
