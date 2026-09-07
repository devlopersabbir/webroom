import { WebRoomMessage } from "../presence/protocol";

export type MessageHandler = (message: WebRoomMessage) => void;

export type BinaryDataHandler = (
  data: ArrayBuffer,
  context: { peerId: string; metadata: Record<string, unknown> }
) => void;

export type BinaryProgressHandler = (
  percent: number,
  context: { peerId: string; metadata: Record<string, unknown> }
) => void;

/**
 * Pluggable Transport interface for peer discovery & communication.
 * Allows switching between BroadcastChannel (local V0 prototype)
 * and WebRTC / P2P transports in future milestones without changing room/presence/chat logic.
 */
export interface Transport {
  /**
   * Initializes the transport channel and begins receiving messages.
   */
  start(): void;

  /**
   * Sends a presence, chat, signaling, or file transfer message to peers in this room.
   * If targetPeerId is specified, the transport directs the message solely to that peer.
   */
  send(message: WebRoomMessage, targetPeerId?: string): void;

  /**
   * Subscribes a handler to receive incoming messages.
   * @returns Unsubscribe function to cleanly remove the handler.
   */
  onMessage(handler: MessageHandler): () => void;

  /**
   * Closes and cleans up the transport channel.
   */
  close(): void;

  /**
   * Sends binary data directly to a targeted peer (or all peers) with progress reporting.
   */
  sendBinary?(
    data: ArrayBuffer | Uint8Array,
    options?: {
      target?: string;
      metadata?: Record<string, unknown>;
      onProgress?: (percent: number) => void;
    }
  ): Promise<void>;

  /**
   * Subscribes to direct binary payloads received from remote peers.
   */
  onBinaryMessage?(handler: BinaryDataHandler): () => void;

  /**
   * Subscribes to incoming binary progress updates.
   */
  onBinaryReceiveProgress?(handler: BinaryProgressHandler): () => void;
}

