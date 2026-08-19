import { WebRoomMessage } from "../presence/protocol";
import { MAX_MESSAGE_LENGTH } from "../shared/constants";
import { Transport } from "../transport/transport";
import { ChatMessage, isValidChatMessage } from "./chat-protocol";
import { ChatStore } from "./chat-store";

export type ChatMessagesListener = (messages: ChatMessage[], latestMessage?: ChatMessage) => void;

/**
 * Generates a collision-resistant unique message ID.
 */
export function generateMessageId(): string {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  return `msg_${uuid}`;
}

/**
 * Coordinates sending, receiving, deduplication, and lifecycle of ephemeral chat messages.
 */
export class ChatManager {
  public readonly roomId: string;
  public readonly peerId: string;
  public readonly avatar: string;
  private readonly transport: Transport;
  private readonly store: ChatStore;

  private unsubscribeTransport: (() => void) | null = null;
  private listeners = new Set<ChatMessagesListener>();
  private isDestroyed = false;

  constructor(
    roomId: string,
    peerId: string,
    avatar: string,
    transport: Transport,
    store = new ChatStore()
  ) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.avatar = avatar;
    this.transport = transport;
    this.store = store;
  }

  /**
   * Starts listening to incoming transport messages for chat traffic.
   */
  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    this.unsubscribeTransport = this.transport.onMessage((msg) => {
      this.handleMessage(msg);
    });
  }

  /**
   * Returns current snapshot of all chat messages in memory.
   */
  public getMessages(): ChatMessage[] {
    return this.store.getMessages();
  }

  /**
   * Subscribes a listener to chat message updates.
   * Immediately calls the listener with the current message snapshot.
   */
  public onMessagesChange(listener: ChatMessagesListener): () => void {
    this.listeners.add(listener);
    listener(this.getMessages());

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Sends an ephemeral chat message to all peers currently in this room.
   */
  public sendMessage(rawText: string): ChatMessage | null {
    if (this.isDestroyed) {
      return null;
    }

    const text = rawText.trim();
    if (text.length === 0 || text.length > MAX_MESSAGE_LENGTH) {
      return null;
    }

    const message: ChatMessage = {
      type: "CHAT_MESSAGE",
      id: generateMessageId(),
      roomId: this.roomId,
      peerId: this.peerId,
      avatar: this.avatar,
      text,
      timestamp: Date.now(),
    };

    // Store in our local in-memory store
    const added = this.store.addMessage(message);
    if (!added) {
      return null;
    }

    // Broadcast across transport to peers
    this.transport.send(message);

    // Notify local subscribers
    this.notifyListeners(message);

    return message;
  }

  /**
   * Handles an incoming message from the transport layer.
   */
  private handleMessage(msg: WebRoomMessage): void {
    if (this.isDestroyed) {
      return;
    }

    // Only process CHAT_MESSAGE types
    if (msg.type !== "CHAT_MESSAGE") {
      return;
    }

    // Ignore self messages (already stored locally on dispatch)
    if (msg.peerId === this.peerId) {
      return;
    }

    // Room validation: ignore messages from other rooms
    if (msg.roomId !== this.roomId) {
      return;
    }

    // Full structural and security validation
    if (!isValidChatMessage(msg, this.roomId)) {
      return;
    }

    // Deduplicate and record message
    const added = this.store.addMessage(msg);
    if (added) {
      this.notifyListeners(msg);
    }
  }

  /**
   * Notifies all active subscribers with current messages list and the newest message.
   */
  private notifyListeners(latestMessage?: ChatMessage): void {
    const currentMessages = this.getMessages();
    for (const listener of this.listeners) {
      try {
        listener(currentMessages, latestMessage);
      } catch (err) {
        console.error("[WebRoom Chat] Error in message listener:", err);
      }
    }
  }

  /**
   * Releases transport subscriptions, clears memory store, and destroys the manager.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }

    this.store.clear();
    this.listeners.clear();
  }
}
