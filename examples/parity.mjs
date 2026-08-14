import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bucket } from "../ts/evaluator.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = JSON.parse(
  readFileSync(join(root, "schemas", "parity-fixture.json"), "utf8"),
);
let failed = 0;
for (const row of doc.bucket) {
  const got = bucket(row.seed, row.attr);
  const ok = got === row.expected;
  if (!ok) failed += 1;
  console.log(
    `ts ${ok ? "ok" : "FAIL"} seed=${JSON.stringify(row.seed)} attr=${JSON.stringify(row.attr)} got=${got} expected=${row.expected}`,
  );
}
if (failed > 0) {
  console.error(`ts parity failures: ${failed}`);
  process.exit(1);
}
console.log(`ts parity tuples=${doc.bucket.length} status=ok`);
