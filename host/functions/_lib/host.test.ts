import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedPagesHost } from "./host.ts";

test("allows only local development hosts", () => {
  assert.equal(isAllowedPagesHost("localhost"), true);
  assert.equal(isAllowedPagesHost("127.0.0.1"), true);
  assert.equal(isAllowedPagesHost("::1"), true);
});

test("rejects lookalike and immutable hosts", () => {
  assert.equal(isAllowedPagesHost("example.pages.dev"), false);
  assert.equal(isAllowedPagesHost("localhost.attacker.example"), false);
  assert.equal(isAllowedPagesHost("evil.example"), false);
});
