import { joinRoom, Room as TrysteroRoom } from "trystero";
import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import { installWebSocketBridge } from "./background-ws-bridge";
import { installWebRTCBridge, SafeRTCPeerConnection } from "./safe-webrtc";
import { BinaryDataHandler, BinaryProgressHandler, MessageHandler, Transport } from "./transport";

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
 * High-availability global STUN servers for instant NAT traversal and low latency.
 * Provides multi-region fallback across Google, Cloudflare, and Twilio STUN infrastructures.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"],
  },
];

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: DEFAULT_ICE_SERVERS,
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 0,
};

/**
 * Serverless decentralized WebRTC transport powered by resilient global relay network.
 * Connects peers across the internet without requiring dedicated servers or databases.
 * Uses the Background WebSocket bridge to guarantee immunity to webpage CSP restrictions.
 */
export class TrysteroTorrentTransport implements Transport {
  public readonly roomId: string;
  private room: TrysteroRoom | null = null;
  private action: { send: (data: any, options?: any) => Promise<void> } | null = null;
  private fileAction: any = null;
  private handlers = new Set<MessageHandler>();
  private binaryHandlers = new Set<BinaryDataHandler>();
  private binaryProgressHandlers = new Set<BinaryProgressHandler>();
  private isClosed = false;
  private seenMessageSignatures = new Set<string>();
  private remotePeerIdMap = new Map<string, string>();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  public start(): void {
    if (this.isClosed || this.room) {
      return;
    }

    // Ensure WebSocket and WebRTC bridges are installed before Trystero opens connections
    installWebSocketBridge();
    installWebRTCBridge();

    try {
      this.room = joinRoom(
        {
          appId: WEBROOM_APP_ID,
          relayConfig: {
            urls: DEFAULT_RELAY_URLS,
            redundancy: 3,
            warnOnRelayFailure: false,
          },
          rtcConfig: DEFAULT_RTC_CONFIG,
          rtcPolyfill: SafeRTCPeerConnection as any,
        },
        this.roomId,
      );

      const msgAction = this.room.makeAction<any>("webroom_payload");
      this.action = msgAction;

      msgAction.onMessage = (data: unknown, context: { peerId: string }) => {
        this.handleIncomingMessage(data, context.peerId);
      };

      // Dedicated WebRTC DataChannel action for 1-to-1 binary streaming
      const fileStreamAction = this.room.makeAction<any>("webroom_file_stream");
      this.fileAction = fileStreamAction;

      fileStreamAction.onMessage = (
        data: unknown,
        context: { peerId: string; metadata?: any },
      ) => {
        const mappedPeerId =
          this.remotePeerIdMap.get(context.peerId) || context.peerId;
        const buffer =
          data instanceof ArrayBuffer
            ? data
            : (data as any)?.buffer instanceof ArrayBuffer
              ? (data as any).buffer
              : (data as any);

        for (const handler of this.binaryHandlers) {
          try {
            handler(buffer, {
              peerId: mappedPeerId,
              metadata: context.metadata || {},
            });
          } catch (err) {
            console.error(
              "[WebRoom Trystero] Error in binary message handler:",
              err,
            );
          }
        }
      };

      fileStreamAction.onReceiveProgress = (
        percent: number,
        context: { peerId: string; metadata?: any },
      ) => {
        const mappedPeerId =
          this.remotePeerIdMap.get(context.peerId) || context.peerId;

        for (const handler of this.binaryProgressHandlers) {
          try {
            handler(percent, {
              peerId: mappedPeerId,
              metadata: context.metadata || {},
            });
          } catch (err) {
            console.error(
              "[WebRoom Trystero] Error in binary progress handler:",
              err,
            );
          }
        }
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
        const mappedPeerId = this.remotePeerIdMap.get(peerId) || peerId;
        this.remotePeerIdMap.delete(peerId);
        for (const handler of this.handlers) {
          try {
            handler({
              type: "GOODBYE",
              roomId: this.roomId,
              peerId: mappedPeerId,
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

  public send(message: WebRoomMessage, targetPeerId?: string): void {
    if (this.isClosed || !this.action) {
      return;
    }

    if (message.roomId !== this.roomId) {
      return;
    }

    const target = targetPeerId || (message as any).targetPeerId;

    try {
      if (target) {
        let trysteroTarget = target;
        for (const [tId, pId] of this.remotePeerIdMap.entries()) {
          if (pId === target) {
            trysteroTarget = tId;
            break;
          }
        }
        this.action.send(message, { target: trysteroTarget });
      } else {
        this.action.send(message);
      }
    } catch (err) {
      console.warn(`[WebRoom Trystero] Failed to broadcast message:`, err);
    }
  }

  public async sendBinary(
    data: ArrayBuffer | Uint8Array,
    options?: {
      target?: string;
      metadata?: Record<string, unknown>;
      onProgress?: (percent: number) => void;
    },
  ): Promise<void> {
    if (this.isClosed || !this.fileAction) {
      return;
    }

    let trysteroTarget = options?.target;
    if (trysteroTarget) {
      for (const [tId, pId] of this.remotePeerIdMap.entries()) {
        if (pId === trysteroTarget) {
          trysteroTarget = tId;
          break;
        }
      }
    }

    try {
      await this.fileAction.send(data, {
        target: trysteroTarget,
        metadata: options?.metadata,
        onProgress: options?.onProgress,
      });
    } catch (err) {
      console.warn(`[WebRoom Trystero] Failed to send binary:`, err);
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public onBinaryMessage(handler: BinaryDataHandler): () => void {
    this.binaryHandlers.add(handler);
    return () => {
      this.binaryHandlers.delete(handler);
    };
  }

  public onBinaryReceiveProgress(handler: BinaryProgressHandler): () => void {
    this.binaryProgressHandlers.add(handler);
    return () => {
      this.binaryProgressHandlers.delete(handler);
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
    this.fileAction = null;
    this.handlers.clear();
    this.binaryHandlers.clear();
    this.binaryProgressHandlers.clear();
    this.seenMessageSignatures.clear();
    this.remotePeerIdMap.clear();
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

    // Map remote Trystero connection ID to actual WebRoom peerId
    const senderPeerId =
      (data as any).peerId ||
      (data as any).followerId ||
      (data as any).leaderId;
    if (senderPeerId && typeof senderPeerId === "string" && remotePeerId) {
      this.remotePeerIdMap.set(remotePeerId, senderPeerId);
    }

    // Deduplicate identical packets
    const pId = senderPeerId || "unknown";
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
