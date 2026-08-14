import { describe, expect, it, vi, afterEach } from "vitest";
import { firePending, type Env } from "./index";

// The failure this file exists to prevent:
//
// The Pages project sits behind Cloudflare Access on every path, including
// /internal/*. An unauthenticated POST is answered by Access with a 302 to its
// login page. `fetch` follows redirects by default, so the sidecar received an
// HTML login page with status 200 — `r.ok` was true, nothing was logged, and a
// completely blocked cron looked healthy. Scheduled flag changes would simply
// never fire, with no signal anywhere.

const baseEnv: Env = {
  DEMO_HOST_ORIGIN: "https://localhost",
  PAGES_INTERNAL_SECRET: "cron-secret",
};

type FetchArgs = [input: string, init?: { redirect?: string; headers?: Record<string, string> }];

function stubFetch(response: Response) {
  const spy = vi.fn(async (..._args: FetchArgs) => response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("firePending", () => {
  it("does not follow redirects", async () => {
    const spy = stubFetch(new Response(null, { status: 200 }));
    await firePending(baseEnv);
    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]![1]!;
    expect(init.redirect).toBe("manual");
  });

  it("reports an Access interception as an error, not a success", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    stubFetch(
      new Response(null, {
        status: 302,
        headers: { location: "https://access.example.com/cdn-cgi/access/login/localhost" },
      }),
    );

    await firePending(baseEnv);

    expect(log).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    const message = String(err.mock.calls[0]![0]);
    expect(message).toContain("blocked by Cloudflare Access");
    // The message must say how to fix it, not just that it failed.
    expect(message).toContain("CF_ACCESS_CLIENT_ID");
  });

  it("reports a non-Access redirect without following it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(
      new Response(null, { status: 301, headers: { location: "https://elsewhere.test/moved" } }),
    );
    await firePending(baseEnv);
    const message = String(err.mock.calls[0]![0]);
    expect(message).toContain("refusing to follow");
    expect(message).not.toContain("Cloudflare Access");
  });

  it("sends Access service-token headers when configured", async () => {
    const spy = stubFetch(new Response(null, { status: 200 }));
    await firePending({
      ...baseEnv,
      CF_ACCESS_CLIENT_ID: "client-id.access",
      CF_ACCESS_CLIENT_SECRET: "client-secret",
    });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["CF-Access-Client-Id"]).toBe("client-id.access");
    expect(headers["CF-Access-Client-Secret"]).toBe("client-secret");
    // The Function's own shared-secret check still runs behind Access.
    expect(headers["x-cron-secret"]).toBe("cron-secret");
  });

  it("omits service-token headers when only one half is configured", async () => {
    const spy = stubFetch(new Response(null, { status: 200 }));
    await firePending({ ...baseEnv, CF_ACCESS_CLIENT_ID: "client-id.access" });
    const headers = spy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["CF-Access-Client-Id"]).toBeUndefined();
  });

  it("logs a plain failure for a non-redirect error status", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(new Response(null, { status: 403 }));
    await firePending(baseEnv);
    expect(String(err.mock.calls[0]![0])).toContain("403");
  });

  it("swallows network errors without throwing out of the cron tick", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    await expect(firePending(baseEnv)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
  });
});
