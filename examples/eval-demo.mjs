import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Evaluator } from "../ts/evaluator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "schemas", "demo.manifest.json"), "utf8"),
);
const ev = new Evaluator(manifest);
const res = ev.evaluate("checkout.promo-banner", {
  userId: "user-alice",
  env: "staging",
});
if (!res.found || res.value === undefined || res.value === null || !res.source) {
  console.error("empty result", res);
  process.exit(1);
}
console.log(`key=${res.key} value=${JSON.stringify(res.value)} source=${res.source}`);
