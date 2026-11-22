import { DurableObject } from "cloudflare:workers";

export interface PeerAttachment {
  peerId: string;
  roomId: string;
  connectedAt: number;
}

interface ClientRelayEnvelope {
  type: "relay";
  targetPeerId?: string;
  payload: Record<string, unknown>;
}

interface ClientRtcSignalEnvelope {
  type: "rtc_signal";
  targetPeerId: string;
  signal: Record<string, unknown>;
}

type ClientEnvelope = ClientRelayEnvelope | ClientRtcSignalEnvelope;

const MAX_MESSAGE_BYTES = 64 * 1024; // 64 KB cap for JSON presence/chat/signaling
const MAX_PEERS_PER_ROOM = 250;

/**
 * Durable Object representing a single WebRoom room (keyed by hashed roomId).
 *
 * Uses Cloudflare's Hibernatable WebSockets API so idle connections incur zero
 * wall-clock duration billing. Stores no messages or URLs in persistent storage.
 */
export class RoomRelayDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);

    // Respond to client "ping" frames with "pong" without waking the Durable Object
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId")?.trim() || "";
    const peerId = url.searchParams.get("peerId")?.trim() || "";

    if (!roomId || !peerId || peerId.length > 128) {
      return new Response("Missing or invalid roomId / peerId", { status: 400 });
    }

    const existingSockets = this.ctx.getWebSockets();
    if (existingSockets.length >= MAX_PEERS_PER_ROOM) {
      return new Response("Room capacity reached", { status: 503 });
    }

    // Close any stale socket for the same peerId (e.g. fast reconnect)
    for (const ws of existingSockets) {
      const attachment = this.getAttachment(ws);
      if (attachment?.peerId === peerId) {
        try {
          ws.close(1000, "Replaced by newer connection");
        } catch {
          // Ignore close errors
        }
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Tag socket with peerId for fast targeted lookup
    this.ctx.acceptWebSocket(server, [peerId]);

    const attachment: PeerAttachment = {
      peerId,
      roomId,
      connectedAt: Date.now(),
    };
    server.serializeAttachment(attachment);

    // Collect currently connected peerIds (excluding self)
    const activePeers: string[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === server) continue;
      const other = this.getAttachment(ws);
      if (other?.peerId && other.peerId !== peerId) {
        activePeers.push(other.peerId);
      }
    }

    // Send welcome with snapshot of active peers in the room
    this.safeSend(server, {
      type: "welcome",
      roomId,
      peerId,
      peers: activePeers,
      timestamp: Date.now(),
    });

    // Notify existing peers of the new arrival
    this.broadcastExcept(server, {
      type: "peer_join",
      roomId,
      peerId,
      timestamp: Date.now(),
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      return;
    }

    if (message.length > MAX_MESSAGE_BYTES) {
      this.safeSend(ws, {
        type: "error",
        code: "PAYLOAD_TOO_LARGE",
        message: "Message exceeds 64KB limit",
      });
      return;
    }

    if (message === "ping") {
      try {
        ws.send("pong");
      } catch {
        // Ignore
      }
      return;
    }

    const sender = this.getAttachment(ws);
    if (!sender) {
      return;
    }

    let parsed: ClientEnvelope;
    try {
      parsed = JSON.parse(message) as ClientEnvelope;
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    if (parsed.type === "relay") {
      if (!parsed.payload || typeof parsed.payload !== "object") {
        return;
      }

      const outbound = {
        type: "relay",
        fromPeerId: sender.peerId,
        payload: parsed.payload,
      };

      const targetPeerId =
        typeof parsed.targetPeerId === "string" && parsed.targetPeerId.length > 0
          ? parsed.targetPeerId
          : typeof (parsed.payload as Record<string, unknown>).targetPeerId === "string"
            ? ((parsed.payload as Record<string, unknown>).targetPeerId as string)
            : undefined;

      if (targetPeerId) {
        this.sendToPeer(targetPeerId, outbound, ws);
      } else {
        this.broadcastExcept(ws, outbound);
      }
      return;
    }

    if (parsed.type === "rtc_signal") {
      if (
        typeof parsed.targetPeerId !== "string" ||
        !parsed.targetPeerId ||
        !parsed.signal ||
        typeof parsed.signal !== "object"
      ) {
        return;
      }

      this.sendToPeer(
        parsed.targetPeerId,
        {
          type: "rtc_signal",
          fromPeerId: sender.peerId,
          signal: parsed.signal,
        },
        ws,
      );
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const sender = this.getAttachment(ws);
    try {
      ws.close(code, reason);
    } catch {
      // Already closed
    }
    this.notifyPeerLeave(ws, sender);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const sender = this.getAttachment(ws);
    try {
      ws.close(1011, "WebSocket error");
    } catch {
      // Ignore
    }
    this.notifyPeerLeave(ws, sender);
  }

  private notifyPeerLeave(ws: WebSocket, sender: PeerAttachment | null): void {
    if (!sender?.peerId) {
      return;
    }

    for (const other of this.ctx.getWebSockets(sender.peerId)) {
      if (other !== ws) {
        return;
      }
    }

    this.broadcastExcept(ws, {
      type: "peer_leave",
      roomId: sender.roomId,
      peerId: sender.peerId,
      timestamp: Date.now(),
    });
  }

  private sendToPeer(targetPeerId: string, data: unknown, senderWs: WebSocket): void {
    const encoded = JSON.stringify(data);
    const targets = this.ctx.getWebSockets(targetPeerId);
    for (const targetWs of targets) {
      if (targetWs === senderWs) continue;
      this.safeSendRaw(targetWs, encoded);
    }
  }

  private broadcastExcept(senderWs: WebSocket, data: unknown): void {
    const encoded = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === senderWs) continue;
      this.safeSendRaw(ws, encoded);
    }
  }

  private safeSend(ws: WebSocket, data: unknown): void {
    this.safeSendRaw(ws, JSON.stringify(data));
  }

  private safeSendRaw(ws: WebSocket, encoded: string): void {
    try {
      ws.send(encoded);
    } catch {
      // Dead socket will be cleaned up on close/error
    }
  }

  private getAttachment(ws: WebSocket): PeerAttachment | null {
    try {
      return (ws.deserializeAttachment() as PeerAttachment) || null;
    } catch {
      return null;
    }
  }
}
