// flag-eval-demo-cron — sidecar Worker that fires pending scheduled changes
// for KEP-010.
//
// Pages Functions don't support `onScheduled`, so this Worker is the
// scheduled handler. On every cron tick it calls
// `POST <DEMO_HOST_ORIGIN>/internal/fire-pending` with a shared secret;
// the Pages Function does the actual Turso query + override apply +
// audit insert (Turso credentials live on the Pages project, not here).

export interface Env {
  DEMO_HOST_ORIGIN: string;
  PAGES_INTERNAL_SECRET: string;
  // Cloudflare Access service token. The Pages project sits behind Access on
  // every path, including /internal/*, so a plain shared-secret POST is
  // intercepted at the edge and never reaches the Function. Setting both of
  // these lets the sidecar authenticate to Access as a service; the
  // x-cron-secret check in the Function still runs behind it.
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    void event;
    ctx.waitUntil(firePending(env));
  },

  // Liveness probe. A scheduled-only Worker exports no `fetch`, so any HTTP GET
  // to its *.workers.dev hostname returns Cloudflare error 1101 ("no fetch
  // handler") as a 500 — which read as a degraded deploy in `ndev endpoints
  // doctor` even though the cron was firing fine. This cheap handler makes the
  // Worker observably alive (and reports what it does) without touching Turso or
  // the Pages app, so the deployment ledger reflects reality.
  fetch(_req: Request, env: Env): Response {
    return Response.json({
      worker: "flag-eval-demo-cron",
      role: "scheduled-sidecar",
      purpose: "fires pending scheduled flag changes (KEP-010)",
      cron: "* * * * *",
      pages_endpoint: env.DEMO_HOST_ORIGIN,
      healthy: true,
    });
  },
};

// Exported for tests: the Access-interception path is the whole reason this
// function has non-trivial logic, and it must not regress silently.
export async function firePending(env: Env): Promise<void> {
  const url = `${env.DEMO_HOST_ORIGIN}/internal/fire-pending`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-cron-secret": env.PAGES_INTERNAL_SECRET,
  };
  // Present the Access service token when configured. Without it, Access
  // answers this request itself and the Function never runs.
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ts: new Date().toISOString() }),
      // Do NOT follow redirects. Cloudflare Access answers an unauthenticated
      // request with a 302 to its login page; following it yields an HTML page
      // with status 200, so `r.ok` is true and a completely blocked cron looks
      // like a success. Manual mode surfaces the 302 as the failure it is.
      redirect: "manual",
    });

    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get("location") ?? "";
      const viaAccess = location.includes("cloudflareaccess.com");
      console.error(
        viaAccess
          ? `fire-pending blocked by Cloudflare Access (${r.status}). Set CF_ACCESS_CLIENT_ID + CF_ACCESS_CLIENT_SECRET on this Worker, or add an Access bypass policy for /internal/*.`
          : `fire-pending redirected (${r.status}) to ${location} — refusing to follow.`,
      );
      return;
    }
    if (!r.ok) {
      console.error(`fire-pending returned ${r.status}`);
      return;
    }
    console.log("fire-pending ok");
  } catch (e) {
    console.error("fire-pending failed:", e);
  }
}
