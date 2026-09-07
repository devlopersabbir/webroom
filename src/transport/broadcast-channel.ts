import { CHANNEL_PREFIX } from "../shared/constants";
import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import { BinaryDataHandler, BinaryProgressHandler, MessageHandler, Transport } from "./transport";

/**
 * BroadcastChannel-based implementation of Transport for local tab-to-tab communication.
 */
export class BroadcastChannelTransport implements Transport {
  private readonly roomId: string;
  private readonly channelName: string;
  private channel: BroadcastChannel | null = null;
  private handlers = new Set<MessageHandler>();
  private binaryHandlers = new Set<BinaryDataHandler>();
  private binaryProgressHandlers = new Set<BinaryProgressHandler>();
  private isClosed = false;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.channelName = `${CHANNEL_PREFIX}${roomId}`;
  }

  public start(): void {
    if (this.isClosed || this.channel) {
      return;
    }

    try {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event: MessageEvent) => {
        this.handleIncomingMessage(event.data);
      };
    } catch (err) {
      console.error(`[WebRoom Transport] Failed to open BroadcastChannel for room ${this.roomId}:`, err);
    }
  }

  public send(message: WebRoomMessage, _targetPeerId?: string): void {
    if (this.isClosed || !this.channel) {
      return;
    }

    // Ensure we only transmit valid messages for this room
    if (message.roomId !== this.roomId) {
      return;
    }

    try {
      this.channel.postMessage(message);
    } catch (err) {
      console.warn(`[WebRoom Transport] Failed to send message via BroadcastChannel:`, err);
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public async sendBinary(
    data: ArrayBuffer | Uint8Array,
    options?: {
      target?: string;
      metadata?: Record<string, unknown>;
      onProgress?: (percent: number) => void;
    }
  ): Promise<void> {
    if (this.isClosed || !this.channel) {
      return;
    }

    try {
      const buffer = data instanceof Uint8Array ? data.buffer : data;
      // Report instantaneous or simulated progress for local broadcast
      options?.onProgress?.(0.5);
      this.channel.postMessage({
        __webroom_binary__: true,
        roomId: this.roomId,
        target: options?.target,
        metadata: options?.metadata || {},
        data: buffer,
      });
      options?.onProgress?.(1.0);
    } catch (err) {
      console.warn(`[WebRoom Transport] Failed to send binary via BroadcastChannel:`, err);
    }
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

    if (this.channel) {
      try {
        this.channel.onmessage = null;
        this.channel.close();
      } catch (err) {
        console.warn(`[WebRoom Transport] Error while closing BroadcastChannel:`, err);
      }
      this.channel = null;
    }

    this.handlers.clear();
    this.binaryHandlers.clear();
    this.binaryProgressHandlers.clear();
  }

  private handleIncomingMessage(data: unknown): void {
    if (this.isClosed) {
      return;
    }

    // Check for internal binary packet
    if (
      data &&
      typeof data === "object" &&
      (data as any).__webroom_binary__ === true &&
      (data as any).roomId === this.roomId
    ) {
      const binPayload = data as {
        data: ArrayBuffer;
        target?: string;
        metadata: Record<string, unknown>;
      };
      const peerId = (binPayload.metadata.senderPeerId as string) || "local_peer";

      for (const progressHandler of this.binaryProgressHandlers) {
        try {
          progressHandler(1.0, { peerId, metadata: binPayload.metadata });
        } catch (err) {
          console.error(`[WebRoom Transport] Error in binary progress handler:`, err);
        }
      }

      for (const handler of this.binaryHandlers) {
        try {
          handler(binPayload.data, { peerId, metadata: binPayload.metadata });
        } catch (err) {
          console.error(`[WebRoom Transport] Error in binary handler:`, err);
        }
      }
      return;
    }

    if (!isValidWebRoomMessage(data, this.roomId)) {
      return;
    }

    for (const handler of this.handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[WebRoom Transport] Error in message handler:`, err);
      }
    }
  }
}
