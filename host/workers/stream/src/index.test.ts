import { describe, expect, it } from "vitest";
import { environmentName, parseLiveStreamEvent, streamTag } from "./protocol";

describe("flag-eval-demo live stream transport", () => {
  it("normalizes environment names and tags", () => {
    expect(environmentName(null)).toBe("default");
    expect(environmentName(" iat ")).toBe("iat");
    expect(streamTag("iat")).toBe("env:iat");
  });

  it("validates a committed audit event", () => {
    expect(parseLiveStreamEvent({
      id: 42,
      action: "set",
      scope: "cloud",
      env: "iat",
      key: "remote.flag",
      value: true,
      prev: false,
      ts: "2026-08-04T00:00:00.000Z",
    })).toMatchObject({ id: 42, env: "iat", key: "remote.flag" });
  });

  it("rejects invalid event identities", () => {
    expect(() => environmentName("bad value")).toThrow("invalid environment");
    expect(() => parseLiveStreamEvent({ id: 0 })).toThrow("positive integer");
    expect(() => parseLiveStreamEvent({
      id: 1, action: "set", scope: "cloud", env: "iat", key: "flag", ts: "not-a-date",
    })).toThrow("ISO timestamp");
  });
});
