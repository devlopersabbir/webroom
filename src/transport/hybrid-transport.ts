import { WebRoomMessage } from "../presence/protocol";
import { BroadcastChannelTransport } from "./broadcast-channel";
import { MessageHandler, Transport } from "./transport";
import { TrysteroTorrentTransport } from "./trystero-transport";

/**
 * Hybrid transport combining local BroadcastChannel (instant tab-to-tab)
 * and decentralized serverless WebRTC (cross-machine WAN).
 */
export class HybridTransport implements Transport {
  public readonly roomId: string;
  private readonly localTransport: BroadcastChannelTransport;
  private readonly remoteTransport: TrysteroTorrentTransport;
  private handlers = new Set<MessageHandler>();
  private isClosed = false;
  private seenSignatures = new Set<string>();

  constructor(
    roomId: string,
    localTransport = new BroadcastChannelTransport(roomId),
    remoteTransport = new TrysteroTorrentTransport(roomId)
  ) {
    this.roomId = roomId;
    this.localTransport = localTransport;
    this.remoteTransport = remoteTransport;
  }

  public start(): void {
    if (this.isClosed) {
      return;
    }

    const onIncoming = (msg: WebRoomMessage) => {
      this.handleIncoming(msg);
    };

    this.localTransport.onMessage(onIncoming);
    this.remoteTransport.onMessage(onIncoming);

    this.localTransport.start();
    this.remoteTransport.start();
  }

  public send(message: WebRoomMessage): void {
    if (this.isClosed) {
      return;
    }

    // Mark our own message signature so we don't echo it back to ourselves
    const signature = this.getSignature(message);
    if (signature) {
      this.seenSignatures.add(signature);
    }

    this.localTransport.send(message);
    this.remoteTransport.send(message);
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

    this.localTransport.close();
    this.remoteTransport.close();
    this.handlers.clear();
    this.seenSignatures.clear();
  }

  private handleIncoming(msg: WebRoomMessage): void {
    if (this.isClosed) {
      return;
    }

    const signature = this.getSignature(msg);
    if (signature) {
      if (this.seenSignatures.has(signature)) {
        return; // Already processed from another transport layer
      }
      this.seenSignatures.add(signature);

      // Keep cache size bounded
      if (this.seenSignatures.size > 500) {
        const it = this.seenSignatures.values();
        for (let i = 0; i < 100; i++) {
          const val = it.next().value;
          if (val) this.seenSignatures.delete(val);
        }
      }
    }

    for (const handler of this.handlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error("[WebRoom HybridTransport] Error in handler:", err);
      }
    }
  }

  private getSignature(msg: WebRoomMessage): string {
    const pId =
      (msg as any).peerId ||
      (msg as any).followerId ||
      (msg as any).leaderId ||
      "unknown";
    const target = (msg as any).targetPeerId ? `_tgt_${(msg as any).targetPeerId}` : "";
    const sdpType = (msg as any).sdp?.type ? `_sdp_${(msg as any).sdp.type}` : "";
    const cand = (msg as any).candidate
      ? `_cand_${(msg as any).candidate.candidate || (msg as any).candidate.sdpMid || (msg as any).candidate.sdpMLineIndex || ""}`
      : "";
    const extra = (msg as any).id || (msg as any).text || (msg as any).scrollY || "";
    return `${msg.type}_${pId}_${msg.timestamp}_${extra}${target}${sdpType}${cand}`;
  }
}
