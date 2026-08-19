import { CHANNEL_PREFIX } from "../shared/constants";
import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import { MessageHandler, Transport } from "./transport";

/**
 * BroadcastChannel-based implementation of Transport for local tab-to-tab communication.
 */
export class BroadcastChannelTransport implements Transport {
  private readonly roomId: string;
  private readonly channelName: string;
  private channel: BroadcastChannel | null = null;
  private handlers = new Set<MessageHandler>();
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

  public send(message: WebRoomMessage): void {
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
  }

  private handleIncomingMessage(data: unknown): void {
    if (this.isClosed) {
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
