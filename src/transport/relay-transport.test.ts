import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebRoomMessage } from "../presence/protocol";
import { WS_CLOSED, WS_CONNECTING, WS_OPEN } from "./background-ws-bridge";
import {
  buildRelayRoomUrl,
  normalizeRelayBaseUrl,
  RelayWebSocketTransport,
  WebSocketLike,
} from "./relay-transport";

class FakeWebSocket implements WebSocketLike {
  public readyState = WS_CONNECTING;
  public onopen: ((event: any) => void) | null = null;
  public onmessage: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;

  public readonly url: string;
  public sent: string[] = [];
  public closed = false;

  constructor(url: string) {
    this.url = url;
  }

  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(String(data));
  }

  public close(): void {
    this.closed = true;
    this.readyState = WS_CLOSED;
  }

  public triggerOpen(): void {
    this.readyState = WS_OPEN;
    this.onopen?.({ type: "open" });
  }

  public triggerMessage(data: unknown): void {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload });
  }

  public triggerClose(code = 1006, reason = ""): void {
    this.readyState = WS_CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
}

describe("RelayWebSocketTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes relay base URLs and builds room URLs", () => {
    expect(normalizeRelayBaseUrl("https://relay.example.com/")).toBe(
      "wss://relay.example.com",
    );
    expect(normalizeRelayBaseUrl("http://localhost:8787///")).toBe(
      "ws://localhost:8787",
    );
    expect(normalizeRelayBaseUrl("relay.example.com")).toBe(
      "wss://relay.example.com",
    );
    expect(
      buildRelayRoomUrl("https://relay.example.com/", "room_abc", "peer_1"),
    ).toBe("wss://relay.example.com/room/room_abc?peerId=peer_1");
  });

  it("queues messages before open and flushes them once connected", () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new RelayWebSocketTransport("room_1", "peer_self", {
      relayUrl: "wss://relay.test.dev",
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    transport.start();
    expect(sockets.length).toBe(1);
    expect(sockets[0].url).toBe(
      "wss://relay.test.dev/room/room_1?peerId=peer_self",
    );

    const hello: WebRoomMessage = {
      type: "HELLO",
      roomId: "room_1",
      peerId: "peer_self",
      avatar: "🦊",
      timestamp: 1700000000000,
    };
    transport.send(hello);
    expect(sockets[0].sent.length).toBe(0);

    sockets[0].triggerOpen();
    expect(sockets[0].sent.length).toBe(1);
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      type: "relay",
      payload: hello,
    });

    transport.close();
  });

  it("delivers validated incoming relay messages and ignores invalid or other-room payloads", () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new RelayWebSocketTransport("room_1", "peer_self", {
      relayUrl: "wss://relay.test.dev",
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    const received: WebRoomMessage[] = [];
    transport.onMessage((msg) => received.push(msg));
    transport.start();
    sockets[0].triggerOpen();

    // Valid message for room_1
    const chatMsg: WebRoomMessage = {
      type: "CHAT_MESSAGE",
      id: "c1",
      roomId: "room_1",
      peerId: "peer_other",
      avatar: "🐼",
      text: "Hello from Cloudflare DO!",
      timestamp: 1700000000100,
    };
    sockets[0].triggerMessage({
      type: "relay",
      fromPeerId: "peer_other",
      payload: chatMsg,
    });

    // Wrong roomId should be ignored
    sockets[0].triggerMessage({
      type: "relay",
      fromPeerId: "peer_other",
      payload: { ...chatMsg, roomId: "room_other" },
    });

    // Pong frame should be ignored cleanly
    sockets[0].triggerMessage("pong");

    expect(received.length).toBe(1);
    expect(received[0]).toEqual(chatMsg);

    transport.close();
  });

  it("emits immediate GOODBYE when server reports peer_leave", () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new RelayWebSocketTransport("room_1", "peer_self", {
      relayUrl: "wss://relay.test.dev",
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    const received: WebRoomMessage[] = [];
    transport.onMessage((msg) => received.push(msg));
    transport.start();
    sockets[0].triggerOpen();

    sockets[0].triggerMessage({
      type: "peer_leave",
      roomId: "room_1",
      peerId: "peer_departed",
      timestamp: 1700000000500,
    });

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({
      type: "GOODBYE",
      roomId: "room_1",
      peerId: "peer_departed",
      timestamp: 1700000000500,
    });

    transport.close();
  });

  it("reconnects automatically after unexpected disconnect and sends keepalive pings", () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new RelayWebSocketTransport("room_1", "peer_self", {
      relayUrl: "wss://relay.test.dev",
      pingIntervalMs: 1000,
      reconnectBaseDelayMs: 500,
      webSocketFactory: (url) => {
        const ws = new FakeWebSocket(url);
        sockets.push(ws);
        return ws;
      },
    });

    transport.start();
    expect(sockets.length).toBe(1);
    sockets[0].triggerOpen();

    vi.advanceTimersByTime(1000);
    expect(sockets[0].sent).toContain("ping");

    // Simulate network drop
    sockets[0].triggerClose(1006, "Network error");
    vi.advanceTimersByTime(1000);
    expect(sockets.length).toBe(2);

    transport.close();
    // Should not reconnect after explicit close
    sockets[1].triggerClose(1000, "Closed");
    vi.advanceTimersByTime(5000);
    expect(sockets.length).toBe(2);
  });
});
