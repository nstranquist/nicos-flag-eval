// GET /api/version
// Identity stamp for SDK polling. Body shape { commit, builtAt, manifestSha256 }.

import manifestJson from "../_runtime/flags.runtime.json";
import releaseJson from "../_runtime/release.json";

const MANIFEST_BODY = JSON.stringify(manifestJson);
let cachedSha: string | null = null;
const BUILT_AT = new Date().toISOString();
async function manifestSha(): Promise<string> {
  if (cachedSha) return cachedSha;
  const enc = new TextEncoder().encode(MANIFEST_BODY);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  cachedSha = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return cachedSha;
}

type VersionEnv = { CF_PAGES?: string; CF_PAGES_COMMIT_SHA?: string };

export const onRequestGet: PagesFunction<VersionEnv> = async ({ request, env }) => {
  const hostname = new URL(request.url).hostname;
  const local = hostname === "127.0.0.1" || hostname === "localhost";
  const commit = !local && env.CF_PAGES === "1" ? env.CF_PAGES_COMMIT_SHA ?? "unknown" : "dev";
  return new Response(
    JSON.stringify({
      version: releaseJson.version,
      commit,
      builtAt: BUILT_AT,
      manifestSha256: await manifestSha(),
    }),
    {
      headers: { "content-type": "application/json" },
    },
  );
};
