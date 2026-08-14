import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OpenFeature, StandardResolutionReasons } from "@openfeature/server-sdk";
import { FlagEvalProvider } from "./provider.ts";
import type { FlagsManifest } from "../../ts/evaluator.ts";

const demo = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../schemas/demo.manifest.json"), "utf8"),
) as FlagsManifest;

test("resolves the demo promo banner through OpenFeature", async (t) => {
  t.after(async () => {
    await OpenFeature.clearProviders();
  });
  await OpenFeature.setProviderAndWait(new FlagEvalProvider({ manifest: demo }));
  const details = await OpenFeature.getClient().getBooleanDetails(
    "checkout.promo-banner",
    false,
    { targetingKey: "user-alice", env: "staging" },
  );
  assert.equal(details.value, true);
  assert.equal(details.reason, StandardResolutionReasons.TARGETING_MATCH);
  assert.equal(details.flagMetadata.provider, "flag-eval");
  assert.equal(details.flagMetadata.type, "boolean");
});

test("returns typed errors for missing and mismatched flags", async (t) => {
  t.after(async () => {
    await OpenFeature.clearProviders();
  });
  await OpenFeature.setProviderAndWait(new FlagEvalProvider({ manifest: demo }));
  const client = OpenFeature.getClient();
  const missing = await client.getBooleanDetails("missing.flag", false);
  assert.equal(missing.value, false);
  assert.equal(missing.errorCode, "FLAG_NOT_FOUND");
  const mismatch = await client.getStringDetails("checkout.promo-banner", "fallback");
  assert.equal(mismatch.value, "fallback");
  assert.equal(mismatch.errorCode, "TYPE_MISMATCH");
});

test("replaces a validated manifest and reports changed keys", async () => {
  const provider = new FlagEvalProvider({ manifest: demo });
  const next: FlagsManifest = {
    ...demo,
    flags: demo.flags.map((flag) =>
      flag.key === "checkout.free-shipping-threshold" ? { ...flag, default: 75 } : flag,
    ),
  };
  assert.deepEqual(provider.replaceManifest(next), ["checkout.free-shipping-threshold"]);
  assert.deepEqual(provider.replaceManifest(next), []);
});
