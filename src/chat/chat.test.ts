import { describe, expect, it } from "vitest";
import { WebRoomMessage } from "../presence/protocol";
import { MAX_MESSAGE_LENGTH } from "../shared/constants";
import { MessageHandler, Transport } from "../transport/transport";
import { ChatManager } from "./chat";
import { ChatMessage, isValidChatMessage } from "./chat-protocol";
import { ChatStore } from "./chat-store";

class SimpleMockTransport implements Transport {
  public sent: WebRoomMessage[] = [];
  private handlers = new Set<MessageHandler>();

  public start(): void {}
  public send(message: WebRoomMessage): void {
    this.sent.push(message);
  }
  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  public emitMessage(message: WebRoomMessage): void {
    for (const h of this.handlers) h(message);
  }
  public close(): void {
    this.handlers.clear();
  }
}

describe("ChatMessage Protocol & Validation", () => {
  it("validates a compliant chat message", () => {
    const msg: ChatMessage = {
      type: "CHAT_MESSAGE",
      id: "msg_12345",
      roomId: "room_abc",
      peerId: "peer_def",
      avatar: "🐸",
      text: "Hello WebRoom!",
      timestamp: Date.now(),
    };

    expect(isValidChatMessage(msg)).toBe(true);
    expect(isValidChatMessage(msg, "room_abc")).toBe(true);
    expect(isValidChatMessage(msg, "room_xyz")).toBe(false);
  });

  it("rejects malformed chat messages", () => {
    expect(isValidChatMessage(null)).toBe(false);
    expect(isValidChatMessage({})).toBe(false);
    expect(isValidChatMessage({ type: "HELLO" })).toBe(false);
    expect(
      isValidChatMessage({
        type: "CHAT_MESSAGE",
        id: "",
        roomId: "r",
        peerId: "p",
        avatar: "🐸",
        text: "hi",
        timestamp: 123,
      })
    ).toBe(false);
    expect(
      isValidChatMessage({
        type: "CHAT_MESSAGE",
        id: "id",
        roomId: "r",
        peerId: "p",
        avatar: "",
        text: "hi",
        timestamp: 123,
      })
    ).toBe(false);
    expect(
      isValidChatMessage({
        type: "CHAT_MESSAGE",
        id: "id",
        roomId: "r",
        peerId: "p",
        avatar: "🐸",
        text: "",
        timestamp: 123,
      })
    ).toBe(false);
    expect(
      isValidChatMessage({
        type: "CHAT_MESSAGE",
        id: "id",
        roomId: "r",
        peerId: "p",
        avatar: "🐸",
        text: "a".repeat(MAX_MESSAGE_LENGTH + 1),
        timestamp: 123,
      })
    ).toBe(false);
    expect(
      isValidChatMessage({
        type: "CHAT_MESSAGE",
        id: "id",
        roomId: "r",
        peerId: "p",
        avatar: "🐸",
        text: "valid",
        timestamp: -10,
      })
    ).toBe(false);
  });
});

describe("ChatStore", () => {
  it("stores messages and avoids duplicates", () => {
    const store = new ChatStore();
    const msg: ChatMessage = {
      type: "CHAT_MESSAGE",
      id: "msg_1",
      roomId: "room_1",
      peerId: "peer_1",
      avatar: "🐸",
      text: "Testing 123",
      timestamp: 1000,
    };

    expect(store.addMessage(msg)).toBe(true);
    expect(store.getMessageCount()).toBe(1);
    expect(store.hasMessage("msg_1")).toBe(true);

    // Duplicate message ID is ignored
    expect(store.addMessage(msg)).toBe(false);
    expect(store.getMessageCount()).toBe(1);

    store.clear();
    expect(store.getMessageCount()).toBe(0);
    expect(store.hasMessage("msg_1")).toBe(false);
  });
});

describe("ChatManager", () => {
  it("sends a message and broadcasts to transport", () => {
    const transport = new SimpleMockTransport();
    const manager = new ChatManager("room_1", "peer_self", "🦊", transport);
    manager.start();

    const received: ChatMessage[][] = [];
    manager.onMessagesChange((messages) => received.push(messages));

    const sent = manager.sendMessage("Hello there!");
    expect(sent).not.toBeNull();
    expect(sent?.text).toBe("Hello there!");
    expect(sent?.avatar).toBe("🦊");
    expect(sent?.peerId).toBe("peer_self");
    expect(transport.sent.length).toBe(1);
    expect(transport.sent[0]).toEqual(sent);

    expect(manager.getMessages().length).toBe(1);
    manager.destroy();
  });

  it("trims and rejects empty or oversized messages", () => {
    const transport = new SimpleMockTransport();
    const manager = new ChatManager("room_1", "peer_self", "🦊", transport);
    manager.start();

    expect(manager.sendMessage("   ")).toBeNull();
    expect(manager.sendMessage("")).toBeNull();
    expect(manager.sendMessage("x".repeat(MAX_MESSAGE_LENGTH + 10))).toBeNull();
    expect(transport.sent.length).toBe(0);

    manager.destroy();
  });

  it("receives and deduplicates peer messages", () => {
    const transport = new SimpleMockTransport();
    const manager = new ChatManager("room_1", "peer_self", "🦊", transport);
    manager.start();

    const peerMsg: ChatMessage = {
      type: "CHAT_MESSAGE",
      id: "msg_peer_1",
      roomId: "room_1",
      peerId: "peer_remote",
      avatar: "🐼",
      text: "Hey from remote peer!",
      timestamp: Date.now(),
    };

    transport.emitMessage(peerMsg);
    expect(manager.getMessages().length).toBe(1);
    expect(manager.getMessages()[0].text).toBe("Hey from remote peer!");

    // Duplicate emission
    transport.emitMessage(peerMsg);
    expect(manager.getMessages().length).toBe(1);

    // Message from another room is ignored
    transport.emitMessage({
      ...peerMsg,
      id: "msg_peer_2",
      roomId: "different_room",
    });
    expect(manager.getMessages().length).toBe(1);

    // Self message via transport is ignored (already in store)
    transport.emitMessage({
      ...peerMsg,
      id: "msg_self_2",
      peerId: "peer_self",
    });
    expect(manager.getMessages().length).toBe(1);

    manager.destroy();
  });

  it("handles malicious script tags as plain text safely", () => {
    const transport = new SimpleMockTransport();
    const manager = new ChatManager("room_1", "peer_self", "🦊", transport);
    manager.start();

    const xssPayload = '<script>alert("pwned")</script>';
    const sent = manager.sendMessage(xssPayload);
    expect(sent?.text).toBe(xssPayload);

    manager.destroy();
  });
});
