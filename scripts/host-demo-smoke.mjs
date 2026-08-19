#!/usr/bin/env node
// Boot wrangler pages dev, POST /api/evaluate, then stop.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = resolve(root, "host");
const port = process.env.HOST_DEMO_PORT || "8788";
const url = `http://127.0.0.1:${port}/api/evaluate`;

function run(cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
}

function sh(cmd, args, cwd) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else reject(new Error(`${cmd} ${args.join(" ")} exit ${code}`));
    });
  });
}

await sh("node", ["host/scripts/prepare-runtime.mjs"], root);
await sh(resolve(host, "node_modules/.bin/vite"), ["build"], host);

const wranglerBin = resolve(host, "node_modules/.bin/wrangler");
const wrangler = run(
  wranglerBin,
  ["pages", "dev", "dist", "--ip", "127.0.0.1", "--port", port, "--persist-to", ".wrangler-demo"],
  host,
);
let buf = "";
wrangler.stdout.on("data", (c) => {
  buf += c;
  process.stdout.write(c);
});
wrangler.stderr.on("data", (c) => {
  buf += c;
  process.stderr.write(c);
});

let lastErr = "not tried";
for (let i = 0; i < 40; i++) {
  await delay(500);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: "checkout.promo-banner",
        ctx: { userId: "user-alice", env: "staging" },
      }),
    });
    const body = await res.json();
    if (res.ok && body.ok === true && body.value === true && body.source === "rule") {
      console.log(`host-demo-smoke ok value=${body.value} source=${body.source}`);
      wrangler.kill("SIGTERM");
      process.exit(0);
    }
    lastErr = `status=${res.status} body=${JSON.stringify(body)}`;
  } catch (err) {
    lastErr = String(err);
  }
}

wrangler.kill("SIGTERM");
console.error(`host-demo-smoke failed: ${lastErr}`);
process.exit(1);
