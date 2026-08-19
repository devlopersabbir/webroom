import { describe, expect, it } from "vitest";
import { WebRoomMessage } from "../presence/protocol";
import { BroadcastChannelTransport } from "./broadcast-channel";
import { HybridTransport } from "./hybrid-transport";
import { MessageHandler, Transport } from "./transport";

class MockTransport implements Transport {
  public sent: WebRoomMessage[] = [];
  private handlers = new Set<MessageHandler>();
  public isClosed = false;

  public start(): void {}
  public send(message: WebRoomMessage): void {
    this.sent.push(message);
  }
  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  public emit(message: WebRoomMessage): void {
    for (const h of this.handlers) h(message);
  }
  public close(): void {
    this.isClosed = true;
    this.handlers.clear();
  }
}

describe("HybridTransport", () => {
  it("broadcasts messages to both local and remote transports", () => {
    const local = new MockTransport();
    const remote = new MockTransport();
    const hybrid = new HybridTransport("test_room", local as any, remote as any);

    hybrid.start();

    const msg: WebRoomMessage = {
      type: "CHAT_MESSAGE",
      id: "msg_1",
      roomId: "test_room",
      peerId: "peer_1",
      avatar: "🦊",
      text: "Cross-machine greeting!",
      timestamp: Date.now(),
    };

    hybrid.send(msg);

    expect(local.sent.length).toBe(1);
    expect(remote.sent.length).toBe(1);
    expect(local.sent[0]).toEqual(msg);
    expect(remote.sent[0]).toEqual(msg);

    hybrid.close();
    expect(local.isClosed).toBe(true);
    expect(remote.isClosed).toBe(true);
  });

  it("deduplicates identical messages arriving from local and remote channels", () => {
    const local = new MockTransport();
    const remote = new MockTransport();
    const hybrid = new HybridTransport("test_room", local as any, remote as any);

    hybrid.start();

    const received: WebRoomMessage[] = [];
    hybrid.onMessage((msg) => {
      received.push(msg);
    });

    const msg: WebRoomMessage = {
      type: "CHAT_MESSAGE",
      id: "msg_duplicate",
      roomId: "test_room",
      peerId: "peer_remote",
      avatar: "🐼",
      text: "P2P WebRTC Message",
      timestamp: 1700000000000,
    };

    // Arrives via local transport first
    local.emit(msg);
    // Duplicate arrives via remote transport
    remote.emit(msg);

    // Should only be dispatched once to listeners
    expect(received.length).toBe(1);
    expect((received[0] as any).id).toBe("msg_duplicate");

    hybrid.close();
  });
});
