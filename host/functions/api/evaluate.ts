// POST /api/evaluate { key, ctx }
// Reads Turso overrides FIRST (when bound), then falls through to the
// curated TS evaluator running against the embedded manifest. Source
// tags on the response mirror the Go store contract.

import { Evaluator, type FlagsManifest, type EvalContext } from "../_runtime/evaluator.ts";
import manifestJson from "../_runtime/flags.runtime.json" with { type: "json" };
import { db, json, type Env } from "../_lib/turso.ts";

const manifest = manifestJson as unknown as FlagsManifest;
let evaluator: Evaluator | null = null;
function getEvaluator(): Evaluator {
  if (!evaluator) evaluator = new Evaluator(manifest);
  return evaluator;
}

type EvalRequest = {
  key: string;
  ctx?: EvalContext & { env?: string };
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: EvalRequest;
  try {
    body = (await request.json()) as EvalRequest;
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  if (!body || typeof body.key !== "string") {
    return json({ ok: false, error: "missing key" }, 400);
  }
  const ctx = publicEvalContext(body.ctx);

  // Tier ahead of the engine: live cloud overrides from Turso. Two
  // env-scope lookups — first the requested env, then "default" as
  // fallback — so a cross-env consumer that doesn't pin env still
  // sees default-env writes from the UI.
  const c = db(env);
  if (c) {
    const envCandidates = [ctx.env, "default"].filter(
      (v, i, a): v is string => !!v && a.indexOf(v) === i,
    );
    for (const envName of envCandidates) {
      try {
        const r = await c.execute({
          sql: `SELECT value FROM overrides WHERE scope = 'cloud' AND env = ? AND key = ?`,
          args: [envName, body.key],
        });
        const raw = r.rows[0]?.value as string | undefined;
        if (raw !== undefined) {
          let parsed: unknown = raw;
          try { parsed = JSON.parse(raw); } catch {}
          return json({
            ok: true,
            key: body.key,
            value: parsed,
            source: "cloud-override",
            reason: `Turso overrides[scope=cloud, env=${envName}]`,
            found: true,
          });
        }
      } catch {
        // best-effort — fall through to engine eval
      }
    }
  }

  // Force-exclude / force-include tier — per-user pins written via
  // OverrideEditor → setForceEntry. Encoded as scope IN
  // ('force-include', 'force-exclude'), key = `<flagKey>:<userId>`. No
  // env fallback (a force-pin in env=default would leak across envs
  // unexpectedly). Exclude wins over include per ResolutionChain tier
  // order (force-exclude is tier 7, force-include is tier 8).
  if (c && ctx.userId) {
    const envName = ctx.env ?? "default";
    const fkey = `${body.key}:${ctx.userId}`;
    try {
      const r = await c.execute({
        sql: `SELECT scope, value FROM overrides WHERE scope IN ('force-include', 'force-exclude') AND env = ? AND key = ?`,
        args: [envName, fkey],
      });
      let excludeHit = false;
      let includeRaw: string | undefined;
      for (const row of r.rows) {
        const scope = row.scope as string;
        if (scope === "force-exclude") excludeHit = true;
        else if (scope === "force-include") includeRaw = row.value as string;
      }
      if (excludeHit) {
        // Exclude semantics: skip all downstream rule eval; fall through
        // to the manifest default (the value the user would see if the
        // flag had no rules at all).
        const spec = manifest.flags.find((f) => f.key === body.key);
        return json({
          ok: true,
          key: body.key,
          value: spec?.default ?? null,
          source: "force-exclude",
          reason: `user ${ctx.userId} force-excluded at env=${envName}; manifest default`,
          found: true,
        });
      }
      if (includeRaw !== undefined) {
        let parsed: unknown = includeRaw;
        try { parsed = JSON.parse(includeRaw); } catch {}
        return json({
          ok: true,
          key: body.key,
          value: parsed,
          source: "force-include",
          reason: `user ${ctx.userId} force-included at env=${envName}`,
          found: true,
        });
      }
    } catch {
      // best-effort — fall through to engine eval
    }
  }

  const res = getEvaluator().evaluate(body.key, ctx);
  if (!res.found) {
    return json({ ok: false, ...res }, 404);
  }
  return json({ ok: true, ...res });
};

function publicEvalContext(raw: EvalContext | undefined): EvalContext {
  if (!raw || typeof raw !== "object") return {};
  const attrs =
    raw.attrs && typeof raw.attrs === "object" && !Array.isArray(raw.attrs)
      ? Object.fromEntries(
          Object.entries(raw.attrs).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : undefined;
  return {
    ...(typeof raw.userId === "string" ? { userId: raw.userId } : {}),
    ...(typeof raw.env === "string" ? { env: raw.env } : {}),
    ...(typeof raw.project === "string" ? { project: raw.project } : {}),
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
  };
}
