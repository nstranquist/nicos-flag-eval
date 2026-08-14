// Stateful live stream transport for flag-eval-demo.
//
// Durable audit replay remains the source of truth. This Worker only delivers
// committed audit events to currently connected clients. Clients reconnect
// through the Pages SSE cursor when a WebSocket is interrupted.

import { DurableObject } from "cloudflare:workers";
import {
  environmentName,
  parseLiveStreamEvent,
  streamTag,
  type LiveStreamEvent,
} from "./protocol";

export { environmentName, parseLiveStreamEvent, streamTag } from "./protocol";
export type { LiveStreamEvent } from "./protocol";

export interface Env {
  STREAM_HUB: DurableObjectNamespace;
  STREAM_PUBLISH_SECRET?: string;
}

const STREAM_ROUTE = "/stream";
const PUBLISH_ROUTE = "/publish";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === STREAM_ROUTE) {
      const envName = environmentName(url.searchParams.get("env"));
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return Response.json({ ok: false, error: "websocket upgrade required" }, { status: 426 });
      }
      const stub = streamStub(env.STREAM_HUB, envName);
      return stub.fetch(new Request(`https://stream.internal/connect?env=${encodeURIComponent(envName)}`, request));
    }

    if (request.method === "POST" && url.pathname === PUBLISH_ROUTE) {
      if (!env.STREAM_PUBLISH_SECRET || request.headers.get("x-stream-secret") !== env.STREAM_PUBLISH_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      let event: LiveStreamEvent;
      try {
        event = parseLiveStreamEvent(await request.json());
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? error.message : "invalid event" }, { status: 400 });
      }
      const stub = streamStub(env.STREAM_HUB, event.env);
      const response = await stub.fetch(new Request("https://stream.internal/publish", {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "content-type": "application/json" },
      }));
      return response;
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true, worker: "flag-eval-demo-stream", transport: "durable-object-websocket" });
    }
    return new Response("not found", { status: 404 });
  },
};

export class FlagStreamHub extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/connect") {
      const envName = environmentName(url.searchParams.get("env"));
      const upgrade = request.headers.get("upgrade")?.toLowerCase();
      if (upgrade !== "websocket") return new Response("websocket upgrade required", { status: 426 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server, [streamTag(envName)]);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && url.pathname === PUBLISH_ROUTE) {
      const event = parseLiveStreamEvent(await request.json());
      const message = JSON.stringify({ type: "override-changed", id: event.id, data: event });
      let delivered = 0;
      for (const socket of this.ctx.getWebSockets(streamTag(event.env))) {
        try {
          socket.send(message);
          delivered += 1;
        } catch {
          socket.close(1011, "stream delivery failed");
        }
      }
      return Response.json({ ok: true, delivered, id: event.id });
    }
    return new Response("not found", { status: 404 });
  }

  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, "client messages are not supported");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // The runtime already closed the socket.
    }
  }
}

function streamStub(namespace: DurableObjectNamespace, envName: string): DurableObjectStub {
  return namespace.get(namespace.idFromName(streamTag(envName)));
}
