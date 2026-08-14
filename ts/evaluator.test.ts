import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Evaluator, bucket, prepareManifest, type FlagsManifest } from "./evaluator.ts";

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

test("segment-only rule is inlined and does not match everyone", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "testdata", "contract.manifest.json"), "utf8"),
  ) as FlagsManifest;
  const ev = new Evaluator(manifest);
  const vip = ev.evaluate("checkout.vip-banner", { attrs: { plan: "vip" } });
  assert.equal(vip.source, "rule");
  assert.equal(vip.value, true);
  const other = ev.evaluate("checkout.vip-banner", { attrs: { plan: "free" } });
  assert.equal(other.source, "default");
  assert.equal(other.value, false);
});

test("cyclic prerequisite fails closed", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "testdata", "contract.manifest.json"), "utf8"),
  ) as FlagsManifest;
  const ev = new Evaluator(manifest);
  const got = ev.evaluate("cycle.alpha", { userId: "user-alice" });
  assert.equal(got.source, "default");
  assert.equal(got.value, false);
});

test("hashVersion folds into the shipped bucket seed", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "testdata", "contract.manifest.json"), "utf8"),
  ) as FlagsManifest;
  const ev = new Evaluator(manifest);
  const got = ev.evaluate("search.reshuffle", { userId: "user-alice" });
  const wantHit = bucket("search.reshuffle|v1", "user-alice") < 50;
  assert.equal(got.value === true, wantHit);
});

test("unknown segment is rejected at prepare", () => {
  assert.throws(() => prepareManifest({
    schemaVersion: 1,
    flags: [{
      key: "x.flag",
      type: "boolean",
      default: false,
      scope: "cross-project",
      rules: [{ segment: "missing-seg", value: true }],
    }],
  }));
});
