// GET /api/manifest
// Returns the embedded flags.runtime.json with edge cache + sha header so
// SDKs can poll cheaply and short-circuit when the sha is unchanged.
//
// KEP-005 contract: status 200, content-type application/json, body shape
// { schemaVersion, flags: [...] }.

import manifestJson from "../_runtime/flags.runtime.json";

const MANIFEST_BODY = JSON.stringify(manifestJson);
let cachedSha: string | null = null;

async function manifestSha(): Promise<string> {
  if (cachedSha) return cachedSha;
  const enc = new TextEncoder().encode(MANIFEST_BODY);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  cachedSha = bufToHex(hash);
  return cachedSha;
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const onRequestGet: PagesFunction = async () => {
  const sha = await manifestSha();
  return new Response(MANIFEST_BODY, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=60",
      "x-manifest-sha256": sha,
    },
  });
};
