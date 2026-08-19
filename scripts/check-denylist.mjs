#!/usr/bin/env node
// Factory leak denylist. Patterns are split so this file does not match itself.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const skipDir = new Set([
  ".git",
  "node_modules",
  "dist",
  "storybook-static",
  "bin",
  "tmp",
]);

const skipFile = new Set([
  "pnpm-lock.yaml",
  "swift-contract",
  "swift-eval-demo",
  "swift-parity",
]);

const patterns = [
  "nicos" + ".agent.",
  "ndev" + ".supabase.",
  "ndev" + "-internal",
  "ADMIN" + "_EMAILS",
  "PAGES" + "_ENDPOINT",
  "nicos-flags" + ".pages.dev",
  "CF_ACCESS" + "_AUD",
  "nicostran" + "@",
  "nstranquist" + "@",
];

function extraFromPointer() {
  const pointer = join(homedir(), "dev", "nicos-flags", "docs", "flag-eval-extract.md");
  if (!existsSync(pointer)) {
    return [];
  }
  const text = readFileSync(pointer, "utf8");
  const fence = text.match(/```\n([\s\S]*?)```/);
  if (!fence) {
    return [];
  }
  return fence[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (skipDir.has(name)) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (skipFile.has(name) || name.endsWith(".out") || name.endsWith(".test")) {
      continue;
    }
    out.push(full);
  }
}

const files = [];
walk(root, files);
const extras = extraFromPointer();
const needles = [...new Set([...patterns, ...extras])];
const hits = [];

for (const file of files) {
  const rel = relative(root, file);
  if (rel === join("scripts", "check-denylist.mjs")) {
    continue;
  }
  let body;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const needle of needles) {
    if (body.includes(needle)) {
      hits.push(`${rel}: ${needle}`);
    }
  }
}

if (hits.length > 0) {
  console.error("denylist failed:");
  for (const hit of hits) {
    console.error(`  ${hit}`);
  }
  process.exit(1);
}

console.log(
  `denylist ok files=${files.length} patterns=${patterns.length} pointer_extras=${extras.length}`,
);
