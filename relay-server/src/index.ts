import { RoomRelayDO } from "./room-do";

export { RoomRelayDO };

export interface Env {
  ROOM_RELAY: DurableObjectNamespace<RoomRelayDO>;
}

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        {
          ok: true,
          service: "webroom-relay-cf",
          timestamp: Date.now(),
        },
        { headers: corsHeaders() },
      );
    }

    // Route: /room/:roomId?peerId=<peerId>
    const match = url.pathname.match(/^\/room\/([^/]+)$/);
    if (match) {
      const roomId = decodeURIComponent(match[1]);
      if (!ROOM_ID_PATTERN.test(roomId)) {
        return new Response("Invalid roomId", {
          status: 400,
          headers: corsHeaders(),
        });
      }

      const peerId = url.searchParams.get("peerId")?.trim();
      if (!peerId || peerId.length > 128) {
        return new Response("Missing or invalid peerId query parameter", {
          status: 400,
          headers: corsHeaders(),
        });
      }

      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected Upgrade: websocket", {
          status: 426,
          headers: corsHeaders(),
        });
      }

      // Deterministic Durable Object per hashed roomId
      const id = env.ROOM_RELAY.idFromName(roomId);
      const stub = env.ROOM_RELAY.get(id);

      const forwardUrl = new URL(request.url);
      forwardUrl.searchParams.set("roomId", roomId);
      forwardUrl.searchParams.set("peerId", peerId);

      return stub.fetch(new Request(forwardUrl.toString(), request));
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },
};
