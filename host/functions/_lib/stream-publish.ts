import type { Env } from "./turso";

export type LiveStreamEvent = {
  id: number;
  action: string;
  scope: string;
  env: string;
  key: string;
  value?: unknown;
  prev?: unknown;
  ts: string;
};

/** Publish after a committed audit row. A transport outage never rolls back a flag change. */
export async function publishLiveStreamEvent(env: Env, event: LiveStreamEvent): Promise<boolean> {
  if (!env.STREAM_PUBLISH_URL || !env.STREAM_PUBLISH_SECRET) return false;
  try {
    const response = await fetch(env.STREAM_PUBLISH_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "x-stream-secret": env.STREAM_PUBLISH_SECRET,
      },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      console.error(`live stream publish returned ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("live stream publish failed", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
