import { joinRoom, Room as TrysteroRoom } from "trystero";
import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import { installWebSocketBridge } from "./background-ws-bridge";
import { MessageHandler, Transport } from "./transport";

export const WEBROOM_APP_ID = "webroom.presence.p2p.v2";

/**
 * Curated high-availability public Nostr relays without Web-of-Trust or rate-limit restrictions.
 */
export const DEFAULT_RELAY_URLS = [
  "wss://relay.primal.net", // Verified: ACCEPTED (High availability, global CDN)
  "wss://purplerelay.com", // Verified: ACCEPTED (Fast edge)
  "wss://nostr.mom", // Verified: ACCEPTED (Open high-speed)
  "wss://nostr.data.haus", // Verified: ACCEPTED (High reliability)
  "wss://relay.snort.social", // Verified: ACCEPTED (Open)
  "wss://yabu.me", // Verified: ACCEPTED (Open)
];

/**
 * Self-hosted Coturn STUN and TURN servers for reliable NAT/Firewall traversal and relay fallback.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    /**
     * Our self-hosted Coturn STUN server.
     */
    urls: "stun:187.124.228.139:3480",
  },
  {
    /**
     * Our self-hosted Coturn TURN server.
     * UDP is preferred for performance.
     * TCP acts as a fallback on restrictive networks.
     */
    urls: [
      "turn:187.124.228.139:3480?transport=udp",
      "turn:187.124.228.139:3480?transport=tcp",
    ],

    /**
     * Development credentials.
     *
     * IMPORTANT:
     * These credentials should eventually be replaced
     * with short-lived TURN credentials.
     */
    username: "webroom",
    credential: "4igKrQfsJgpjifzV9d55qR8r7CZfytI00r7pv3WX",
  },
];

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 10,
};

/**
 * Serverless decentralized WebRTC transport powered by resilient global relay network.
 * Connects peers across the internet without requiring dedicated servers or databases.
 * Uses the Background WebSocket bridge to guarantee immunity to webpage CSP restrictions.
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

    // Ensure WebSocket bridge is installed before Trystero opens connections
    installWebSocketBridge();

    try {
      this.room = joinRoom(
        {
          appId: WEBROOM_APP_ID,
          relayConfig: {
            urls: DEFAULT_RELAY_URLS,
            redundancy: 3,
          },
          rtcConfig: DEFAULT_RTC_CONFIG,
        },
        this.roomId,
      );

      const msgAction = this.room.makeAction<any>("webroom_payload");
      this.action = msgAction;

      msgAction.onMessage = (data: unknown, context: { peerId: string }) => {
        this.handleIncomingMessage(data, context.peerId);
      };

      this.room.onPeerJoin = (peerId: string) => {
        console.log(
          `[WebRoom Trystero] 🎉 Peer joined room ${this.roomId}:`,
          peerId,
        );
        // Immediately dispatch peer discovery to all local handlers (PresenceManager, VoiceManager)
        for (const handler of this.handlers) {
          try {
            handler({
              type: "HELLO",
              roomId: this.roomId,
              peerId: peerId,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.warn(
              "[WebRoom Trystero] Error in onPeerJoin handler:",
              err,
            );
          }
        }
      };

      this.room.onPeerLeave = (peerId: string) => {
        console.log(
          `[WebRoom Trystero] 👋 Peer left room ${this.roomId}:`,
          peerId,
        );
        for (const handler of this.handlers) {
          try {
            handler({
              type: "GOODBYE",
              roomId: this.roomId,
              peerId: peerId,
              timestamp: Date.now(),
            });
          } catch (err) {
            console.warn(
              "[WebRoom Trystero] Error in onPeerLeave handler:",
              err,
            );
          }
        }
      };
    } catch (err) {
      console.error(
        `[WebRoom Trystero] Failed to join decentralized room ${this.roomId}:`,
        err,
      );
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
      console.warn(
        `[WebRoom Trystero] Received invalid message payload for room ${this.roomId}:`,
        data,
      );
      return;
    }

    // Deduplicate identical packets
    const pId =
      (data as any).peerId ||
      (data as any).followerId ||
      (data as any).leaderId ||
      "unknown";
    const target = (data as any).targetPeerId
      ? `_tgt_${(data as any).targetPeerId}`
      : "";
    const sdpType = (data as any).sdp?.type
      ? `_sdp_${(data as any).sdp.type}`
      : "";
    const cand = (data as any).candidate
      ? `_cand_${(data as any).candidate.candidate || (data as any).candidate.sdpMid || (data as any).candidate.sdpMLineIndex || ""}`
      : "";
    const extra =
      (data as any).id || (data as any).text || (data as any).scrollY || "";
    const signature = `${(data as any).type}_${pId}_${(data as any).timestamp}_${remotePeerId}_${extra}${target}${sdpType}${cand}`;
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
