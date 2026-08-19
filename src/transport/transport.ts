import { PresenceMessage } from "../presence/protocol";

export type MessageHandler = (message: PresenceMessage) => void;

/**
 * Pluggable Transport interface for peer discovery & communication.
 * Allows switching between BroadcastChannel (local V0 prototype)
 * and WebRTC / P2P transports in future milestones without changing room/presence logic.
 */
export interface Transport {
  /**
   * Initializes the transport channel and begins receiving messages.
   */
  start(): void;

  /**
   * Sends a presence message to peers in this room.
   */
  send(message: PresenceMessage): void;

  /**
   * Subscribes a handler to receive incoming messages.
   * @returns Unsubscribe function to cleanly remove the handler.
   */
  onMessage(handler: MessageHandler): () => void;

  /**
   * Closes and cleans up the transport channel.
   */
  close(): void;
}
