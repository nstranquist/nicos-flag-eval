import assert from "node:assert/strict";
import test from "node:test";
import { OpenFeature, StandardResolutionReasons } from "@openfeature/server-sdk";
import { FlagEvalProvider } from "./provider.ts";
import type { FlagsManifest } from "../../ts/evaluator.ts";

const conformanceManifest: FlagsManifest = {
  schemaVersion: 1,
  flags: [
    {
      key: "boolean-flag",
      type: "boolean",
      default: false,
      scope: "cross-project",
      rules: [{ variants: [{ key: "on", weight: 100, value: true }] }],
    },
    {
      key: "string-flag",
      type: "string",
      default: "bye",
      scope: "cross-project",
      rules: [{ variants: [{ key: "greeting", weight: 100, value: "hi" }] }],
    },
    {
      key: "integer-flag",
      type: "number",
      default: 1,
      scope: "cross-project",
      rules: [{ variants: [{ key: "ten", weight: 100, value: 10 }] }],
    },
  ],
};

test("Appendix B typed evaluation scenarios", async (t) => {
  t.after(async () => {
    await OpenFeature.clearProviders();
  });
  await OpenFeature.setProviderAndWait(new FlagEvalProvider({ manifest: conformanceManifest }));
  const client = OpenFeature.getClient();
  const booleanDetails = await client.getBooleanDetails("boolean-flag", false);
  const stringDetails = await client.getStringDetails("string-flag", "bye");
  const integerDetails = await client.getNumberDetails("integer-flag", 1);
  assert.equal(booleanDetails.value, true);
  assert.equal(booleanDetails.variant, "on");
  assert.equal(booleanDetails.reason, StandardResolutionReasons.STATIC);
  assert.equal(stringDetails.value, "hi");
  assert.equal(integerDetails.value, 10);
});
