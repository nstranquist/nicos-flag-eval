#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const storiesRoot = join(root, "host/src");
const required = ["checkout.promo-banner", "search.ranking-variant"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const files = walk(storiesRoot);
if (files.length < 5) {
  throw new Error(`expected demo stories under ${storiesRoot}`);
}
const blob = files.map((file) => readFileSync(file, "utf8")).join("\n");
if (/\bnicos\.[a-z]/.test(blob) || /\bndev\.[a-z]/.test(blob)) {
  throw new Error("stories still contain factory-prefixed keys");
}
if (blob.includes("@gmail.com")) {
  throw new Error("stories still contain personal inboxes");
}
for (const key of required) {
  if (!blob.includes(key)) throw new Error(`stories missing demo key ${key}`);
}
console.log(`stories check ok (${files.length} files)`);
