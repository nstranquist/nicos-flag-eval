#!/usr/bin/env node
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extractRoot = resolve(here, "../..");
const hostRoot = resolve(here, "..");
const demo = JSON.parse(
  readFileSync(resolve(extractRoot, "schemas", "demo.manifest.json"), "utf8"),
);
writeFileSync(
  resolve(hostRoot, "functions/_runtime/flags.runtime.json"),
  `${JSON.stringify(demo, null, 2)}\n`,
);
copyFileSync(
  resolve(extractRoot, "ts/evaluator.ts"),
  resolve(hostRoot, "functions/_runtime/evaluator.ts"),
);
console.log(`prepared demo runtime (${demo.flags.length} flags)`);
