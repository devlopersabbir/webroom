import { describe, expect, it } from "vitest";
import { PeerStore } from "./peer-store";
import { PresenceManager } from "./presence";
import { isValidPresenceMessage, PresenceMessage } from "./protocol";
import { MessageHandler, Transport } from "../transport/transport";

class SimpleMockTransport implements Transport {
  public sent: PresenceMessage[] = [];
  private handlers = new Set<MessageHandler>();

  public start(): void {}
  public send(message: PresenceMessage): void {
    this.sent.push(message);
  }
  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  public emitMessage(message: PresenceMessage): void {
    for (const h of this.handlers) h(message);
  }
  public close(): void {
    this.handlers.clear();
  }
}

describe("Protocol Validation", () => {
  it("validates correct presence messages", () => {
    const msg: PresenceMessage = {
      type: "HELLO",
      roomId: "room123",
      peerId: "peer456",
      timestamp: Date.now(),
    };

    expect(isValidPresenceMessage(msg)).toBe(true);
    expect(isValidPresenceMessage(msg, "room123")).toBe(true);
    expect(isValidPresenceMessage(msg, "otherRoom")).toBe(false);
  });

  it("rejects invalid messages", () => {
    expect(isValidPresenceMessage(null)).toBe(false);
    expect(isValidPresenceMessage({})).toBe(false);
    expect(isValidPresenceMessage({ type: "UNKNOWN", roomId: "r", peerId: "p", timestamp: 123 })).toBe(false);
    expect(isValidPresenceMessage({ type: "HELLO", roomId: "", peerId: "p", timestamp: 123 })).toBe(false);
    expect(isValidPresenceMessage({ type: "HELLO", roomId: "r", peerId: "", timestamp: 123 })).toBe(false);
    expect(isValidPresenceMessage({ type: "HELLO", roomId: "r", peerId: "p", timestamp: -1 })).toBe(false);
  });
});

describe("PeerStore", () => {
  it("tracks peers and updates timestamps", () => {
    const store = new PeerStore();
    expect(store.getPeerCount()).toBe(0);

    const isNew = store.updatePeer("peer1", 1000);
    expect(isNew).toBe(true);
    expect(store.getPeerCount()).toBe(1);

    const isUpdated = store.updatePeer("peer1", 2000);
    expect(isUpdated).toBe(false);
    expect(store.getPeerCount()).toBe(1);
  });

  it("removes peers explicitly", () => {
    const store = new PeerStore();
    store.updatePeer("peer1", 1000);
    store.updatePeer("peer2", 1000);
    expect(store.getPeerCount()).toBe(2);

    expect(store.removePeer("peer1")).toBe(true);
    expect(store.getPeerCount()).toBe(1);
    expect(store.removePeer("peer1")).toBe(false);
  });

  it("cleans up timed-out peers", () => {
    const store = new PeerStore();
    const now = 10000;
    const timeoutMs = 5000;

    store.updatePeer("activePeer", now - 2000); // 2s ago (alive)
    store.updatePeer("stalePeer", now - 6000);  // 6s ago (timed out)

    expect(store.getPeerCount()).toBe(2);

    const evicted = store.cleanupTimedOut(timeoutMs, now);
    expect(evicted).toEqual(["stalePeer"]);
    expect(store.getPeerCount()).toBe(1);
    expect(store.getAllPeers()[0].peerId).toBe("activePeer");
  });
});

describe("PresenceManager Unit Tests", () => {
  it("sends HELLO on start and ignores own messages", () => {
    const transport = new SimpleMockTransport();
    const manager = new PresenceManager("test-room", "peer-self", transport);

    manager.start();
    expect(transport.sent.length).toBe(1);
    expect(transport.sent[0]).toMatchObject({
      type: "HELLO",
      roomId: "test-room",
      peerId: "peer-self",
    });

    // Emitting self message does not increase count
    transport.emitMessage({
      type: "HEARTBEAT",
      roomId: "test-room",
      peerId: "peer-self",
      timestamp: Date.now(),
    });
    expect(manager.getOnlineCount()).toBe(1);

    manager.destroy();
  });

  it("responds with HEARTBEAT when a remote peer sends HELLO", () => {
    const transport = new SimpleMockTransport();
    const manager = new PresenceManager("test-room", "peer-self", transport);
    manager.start();

    transport.sent = []; // clear initial HELLO

    transport.emitMessage({
      type: "HELLO",
      roomId: "test-room",
      peerId: "peer-remote",
      timestamp: Date.now(),
    });

    expect(manager.getOnlineCount()).toBe(2);
    expect(transport.sent.length).toBe(1);
    expect(transport.sent[0]).toMatchObject({
      type: "HEARTBEAT",
      roomId: "test-room",
      peerId: "peer-self",
    });

    manager.destroy();
  });
});
