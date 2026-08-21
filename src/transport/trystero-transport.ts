import { joinRoom } from "@trystero-p2p/mqtt";
import type { Room as TrysteroRoom } from "@trystero-p2p/core";
import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import { installWebSocketBridge } from "./background-ws-bridge";
import { MessageHandler, Transport } from "./transport";

export const WEBROOM_APP_ID = "webroom.presence.p2p.v2";

/**
 * Public high-availability decentralized MQTT WebRTC signaling broker pool.
 * MQTT brokers support live bidirectional topic multiplexing without timestamp expirations.
 */
export const DEFAULT_RELAY_URLS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
];

/**
 * Public redundant STUN and TURN servers for reliable NAT/Firewall traversal.
 * Includes OpenRelay global TURN servers so peers behind Symmetric NAT, router firewalls,
 * and different Wi-Fi / cellular networks can establish direct WebRTC data channels.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // STUN for direct LAN and open NAT hole-punching
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },

  // OpenRelay Global TURN Relays for strict Symmetric NAT / Wi-Fi Router Firewalls / 4G/5G
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

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
      console.log(`[WebRoom] Initializing decentralized room for hash: ${this.roomId.slice(0, 12)}...`);
      this.room = joinRoom(
        {
          appId: WEBROOM_APP_ID,
          relayConfig: {
            urls: DEFAULT_RELAY_URLS,
            redundancy: 3,
          },
          rtcConfig: {
            iceServers: DEFAULT_ICE_SERVERS,
            iceCandidatePoolSize: 10,
          },
        },
        this.roomId
      );

      const msgAction = this.room.makeAction<any>("webroom_payload");
      this.action = msgAction;

      msgAction.onMessage = (data: unknown, context: { peerId: string }) => {
        this.handleIncomingMessage(data, context.peerId);
      };

      this.room.onPeerJoin = (peerId: string) => {
        console.log(`[WebRoom Trystero] Remote WebRTC peer joined room ${this.roomId}: ${peerId}`);
      };

      this.room.onPeerLeave = (peerId: string) => {
        console.log(`[WebRoom Trystero] Remote WebRTC peer left room ${this.roomId}: ${peerId}`);
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
      console.warn(`[WebRoom Trystero] Received invalid message payload for room ${this.roomId}:`, data);
      return;
    }

    // Deduplicate identical packets
    const pId = (data as any).peerId || (data as any).followerId || (data as any).leaderId || "unknown";
    const target = (data as any).targetPeerId ? `_tgt_${(data as any).targetPeerId}` : "";
    const sdpType = (data as any).sdp?.type ? `_sdp_${(data as any).sdp.type}` : "";
    const cand = (data as any).candidate
      ? `_cand_${(data as any).candidate.candidate || (data as any).candidate.sdpMid || (data as any).candidate.sdpMLineIndex || ""}`
      : "";
    const extra = (data as any).id || (data as any).text || (data as any).scrollY || "";
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

    console.log(`[WebRoom Trystero] Received ${(data as any).type} from remote peer ${remotePeerId} (payload peerId: ${pId})`);

    for (const handler of this.handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[WebRoom Trystero] Error in message handler:`, err);
      }
    }
  }
}
