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

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
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

const remotes = [
  "host/src/components/EvalPanel.svelte",
  "host/src/components/EnvMatrix.svelte",
  "host/src/components/OverrideEditor.svelte",
];
for (const rel of remotes) {
  const src = read(rel);
  if (!/if\s*\(\s*skipRemote\s*\)/.test(src)) {
    throw new Error(`${rel} does not gate remote calls on skipRemote`);
  }
}

const flagDetail = read("host/src/components/FlagDetail.svelte");
if (!/<EvalPanel[^>]*\{skipRemote\}/.test(flagDetail)) {
  throw new Error("FlagDetail does not pass skipRemote to EvalPanel");
}
if (!/<EnvMatrix[^>]*\{skipRemote\}/.test(flagDetail)) {
  throw new Error("FlagDetail does not pass skipRemote to EnvMatrix");
}

const storyMustSkip = [
  "host/src/lib/stories/Flags/EvalPanel.stories.svelte",
  "host/src/lib/stories/Flags/FlagDetail.stories.svelte",
  "host/src/lib/stories/Flags/OverrideEditor.stories.svelte",
];
for (const rel of storyMustSkip) {
  if (!read(rel).includes("skipRemote")) {
    throw new Error(`${rel} does not set skipRemote`);
  }
}

const auditStory = read("host/src/lib/stories/Flags/AuditTimeline.stories.svelte");
if (!/\bevents\s*:/.test(auditStory)) {
  throw new Error("AuditTimeline stories do not pass fixture events");
}

const storyFiles = files.filter((f) => f.endsWith(".stories.svelte"));
for (const file of storyFiles) {
  const src = readFileSync(file, "utf8");
  if (src.includes("App.svelte")) {
    throw new Error(`${file} mounts App.svelte (that page fetches /api/*)`);
  }
}

console.log(`stories check ok (${files.length} files)`);
