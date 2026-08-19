import { ChatMessage } from "./chat-protocol";

/**
 * In-memory ephemeral store for chat messages and deduplication tracking.
 * Maintains zero persistent storage (no localStorage, IndexedDB, or server sync).
 */
export class ChatStore {
  private messages: ChatMessage[] = [];
  private seenMessageIds = new Set<string>();

  /**
   * Adds a chat message if its ID has not been seen before.
   * @returns true if the message was new and added, false if duplicate.
   */
  public addMessage(message: ChatMessage): boolean {
    if (this.seenMessageIds.has(message.id)) {
      return false;
    }

    this.seenMessageIds.add(message.id);
    this.messages.push(message);
    return true;
  }

  /**
   * Checks if a message ID has already been recorded.
   */
  public hasMessage(id: string): boolean {
    return this.seenMessageIds.has(id);
  }

  /**
   * Returns a snapshot array of all received chat messages in chronological order.
   */
  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Returns total number of messages in the store.
   */
  public getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Clears all in-memory messages and deduplication IDs (e.g. on page navigation/room exit).
   */
  public clear(): void {
    this.messages = [];
    this.seenMessageIds.clear();
  }
}
