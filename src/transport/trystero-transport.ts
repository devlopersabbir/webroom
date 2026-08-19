import { joinRoom, Room as TrysteroRoom } from "@trystero-p2p/torrent";
import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import { MessageHandler, Transport } from "./transport";

export const WEBROOM_APP_ID = "webroom.presence.p2p.v2";

/**
 * Serverless decentralized WebRTC transport powered by BitTorrent WebRTC trackers.
 * Connects 2, 3, 4, 5, 6+ machines across the internet without requiring servers or databases.
 */
export class TrysteroTorrentTransport implements Transport {
  public readonly roomId: string;
  private room: TrysteroRoom | null = null;
  private action: { send: (data: any) => Promise<void> } | null = null;
  private handlers = new Set<MessageHandler>();
  private isClosed = false;
  private seenMessageSignatures = new Set<string>();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  public start(): void {
    if (this.isClosed || this.room) {
      return;
    }

    try {
      this.room = joinRoom(
        {
          appId: WEBROOM_APP_ID,
          // Use redundant public STUN servers for reliable NAT traversal
          rtcConfig: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:stun2.l.google.com:19302" },
              { urls: "stun:global.stun.twilio.com:3478" },
            ],
          },
        },
        this.roomId
      );

      const msgAction = this.room.makeAction<any>("webroom_payload");
      this.action = msgAction;

      msgAction.onMessage = (data: unknown, context: { peerId: string }) => {
        this.handleIncomingMessage(data, context.peerId);
      };
    } catch (err) {
      console.error(`[WebRoom Trystero] Failed to join decentralized room ${this.roomId}:`, err);
    }
  }

  public send(message: WebRoomMessage): void {
    if (this.isClosed || !this.action) {
      return;
    }

    if (message.roomId !== this.roomId) {
      return;
    }

    try {
      this.action.send(message);
    } catch (err) {
      console.warn(`[WebRoom Trystero] Failed to broadcast message:`, err);
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;

    if (this.room) {
      try {
        this.room.leave();
      } catch (err) {
        console.warn(`[WebRoom Trystero] Error while leaving room:`, err);
      }
      this.room = null;
    }

    this.action = null;
    this.handlers.clear();
    this.seenMessageSignatures.clear();
  }

  private handleIncomingMessage(data: unknown, remotePeerId: string): void {
    if (this.isClosed) {
      return;
    }

    if (!isValidWebRoomMessage(data, this.roomId)) {
      return;
    }

    // Deduplicate identical packets
    const signature = `${(data as any).type}_${(data as any).peerId || (data as any).followerId || (data as any).leaderId}_${(data as any).timestamp}_${remotePeerId}`;
    if (this.seenMessageSignatures.has(signature)) {
      return;
    }
    this.seenMessageSignatures.add(signature);
    if (this.seenMessageSignatures.size > 200) {
      // Keep signature cache bounded
      const it = this.seenMessageSignatures.values();
      for (let i = 0; i < 50; i++) {
        const val = it.next().value;
        if (val) this.seenMessageSignatures.delete(val);
      }
    }

    for (const handler of this.handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[WebRoom Trystero] Error in message handler:`, err);
      }
    }
  }
}
