import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Evaluator, bucket, type FlagsManifest } from "./evaluator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type ParityFile = {
  bucket: Array<{ seed: string; attr: string; expected: number }>;
};

test("bucket matches the shipped parity fixture", () => {
  const doc = JSON.parse(
    readFileSync(join(root, "schemas", "parity-fixture.json"), "utf8"),
  ) as ParityFile;
  assert.equal(doc.bucket.length, 9);
  for (const row of doc.bucket) {
    assert.equal(bucket(row.seed, row.attr), row.expected, `${row.seed}|${row.attr}`);
  }
});

test("evaluate demo checkout.promo-banner via shipped Evaluator", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "schemas", "demo.manifest.json"), "utf8"),
  ) as FlagsManifest;
  const ev = new Evaluator(manifest);
  const got = ev.evaluate("checkout.promo-banner", {
    userId: "user-alice",
    env: "staging",
  });
  assert.equal(got.found, true);
  assert.equal(got.source, "rule");
  assert.equal(got.value, true);
});
