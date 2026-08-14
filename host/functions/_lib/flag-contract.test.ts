import assert from "node:assert/strict";
import test from "node:test";
import { registeredOverrideFlag } from "./flag-contract.ts";

test("cloud overrides require an exact registered flag key", () => {
  assert.equal(registeredOverrideFlag("cloud", "checkout.promo-banner"), "checkout.promo-banner");
  assert.equal(registeredOverrideFlag("cloud", "checkout.promo-banner:user-alice"), null);
  assert.equal(registeredOverrideFlag("cloud", "missing.flag"), null);
});

test("force-list keys register the flag prefix before the user id", () => {
  assert.equal(
    registeredOverrideFlag("force-include", "checkout.promo-banner:user-alice"),
    "checkout.promo-banner",
  );
  assert.equal(
    registeredOverrideFlag("force-exclude", "checkout.promo-banner:user-alice"),
    "checkout.promo-banner",
  );
  assert.equal(registeredOverrideFlag("force-include", "missing.flag:user-alice"), null);
  assert.equal(registeredOverrideFlag("force-include", "checkout.promo-banner"), null);
  assert.equal(registeredOverrideFlag("force-include", ":user-alice"), null);
});
