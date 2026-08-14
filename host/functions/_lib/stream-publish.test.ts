import { afterEach, describe, expect, it, vi } from "vitest";
import { publishLiveStreamEvent } from "./stream-publish";

const event = {
  id: 42,
  action: "set",
  scope: "cloud",
  env: "iat",
  key: "checkout.promo-banner",
  value: true,
  prev: false,
  ts: "2026-08-04T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live stream publisher", () => {
  it("does nothing when the optional transport is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(publishLiveStreamEvent({}, event)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("publishes only after the caller commits its audit row", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(publishLiveStreamEvent({
      STREAM_PUBLISH_URL: "https://stream.test/publish",
      STREAM_PUBLISH_SECRET: "secret",
    }, event)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://stream.test/publish", expect.objectContaining({
      method: "POST",
      redirect: "manual",
      headers: expect.objectContaining({ "x-stream-secret": "secret" }),
      body: JSON.stringify(event),
    }));
  });

  it("reports a transport failure without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(publishLiveStreamEvent({
      STREAM_PUBLISH_URL: "https://stream.test/publish",
      STREAM_PUBLISH_SECRET: "secret",
    }, event)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith("live stream publish returned 503");
  });
});
