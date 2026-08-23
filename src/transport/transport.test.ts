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

  it("does not drop simultaneous targeted voice signaling messages to different peers", () => {
    const local = new MockTransport();
    const remote = new MockTransport();
    const hybrid = new HybridTransport("test_room", local as any, remote as any);

    hybrid.start();

    const received: WebRoomMessage[] = [];
    hybrid.onMessage((msg) => {
      received.push(msg);
    });

    const timestamp = 1700000000000;

    const offerToPeerB: WebRoomMessage = {
      type: "VOICE_OFFER",
      roomId: "test_room",
      peerId: "peer_a",
      targetPeerId: "peer_b",
      sdp: { type: "offer", sdp: "sdp_for_b" },
      timestamp,
    } as any;

    const offerToPeerC: WebRoomMessage = {
      type: "VOICE_OFFER",
      roomId: "test_room",
      peerId: "peer_a",
      targetPeerId: "peer_c",
      sdp: { type: "offer", sdp: "sdp_for_c" },
      timestamp,
    } as any;

    local.emit(offerToPeerB);
    local.emit(offerToPeerC);

    // Both messages must be delivered because targetPeerId differs
    expect(received.length).toBe(2);
    expect((received[0] as any).targetPeerId).toBe("peer_b");
    expect((received[1] as any).targetPeerId).toBe("peer_c");

    hybrid.close();
  });
});

describe("WebRTC ICE Configuration & Network Traversal", () => {
  it("restricts STUN servers to high-availability global anycast endpoints (Google & Twilio)", async () => {
    const { DEFAULT_ICE_SERVERS, DEFAULT_RTC_CONFIG } = await import(
      "./trystero-transport"
    );

    const stunEntry = DEFAULT_ICE_SERVERS.find((s) =>
      Array.isArray(s.urls)
        ? s.urls.some((u) => u.startsWith("stun:"))
        : (s.urls as string)?.startsWith("stun:"),
    );
    expect(stunEntry).toBeDefined();

    const stunUrls = Array.isArray(stunEntry!.urls)
      ? stunEntry!.urls
      : [stunEntry!.urls];

    // Must be lean (<= 2) to avoid candidate flooding and slow discovery
    expect(stunUrls.length).toBeLessThanOrEqual(2);
    expect(stunUrls.some((u) => u.includes("stun.l.google.com"))).toBe(true);
    expect(stunUrls.some((u) => u.includes("twilio.com"))).toBe(true);
  });

  it("configures RTCConfiguration for immediate on-demand candidate gathering", async () => {
    const { DEFAULT_RTC_CONFIG } = await import("./trystero-transport");

    expect(DEFAULT_RTC_CONFIG.iceTransportPolicy).toBe("all");
    expect(DEFAULT_RTC_CONFIG.iceCandidatePoolSize).toBe(0);
  });
});

