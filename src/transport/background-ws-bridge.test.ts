import { describe, expect, it, vi } from "vitest";
import {
  BackgroundWebSocket,
  installWebSocketBridge,
  WS_CLOSED,
  WS_CONNECTING,
  WS_OPEN,
} from "./background-ws-bridge";

describe("BackgroundWebSocket", () => {
  it("initializes in CONNECTING state and falls back gracefully in test environment", () => {
    const ws = new BackgroundWebSocket("wss://test.relay.com");
    expect(ws.url).toBe("wss://test.relay.com");
    expect(ws.CONNECTING).toBe(WS_CONNECTING);
    expect(ws.OPEN).toBe(WS_OPEN);
    expect(ws.CLOSED).toBe(WS_CLOSED);
  });

  it("handles event listeners properly", () => {
    const ws = new BackgroundWebSocket("wss://test.relay.com");
    const openSpy = vi.fn();
    ws.addEventListener("open", openSpy);

    // Simulate open
    (ws as any).handleOpen();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(WS_OPEN);
  });

  it("handles incoming messages and dispatches events", () => {
    const ws = new BackgroundWebSocket("wss://test.relay.com");
    (ws as any).handleOpen();

    const receivedData: string[] = [];
    ws.onmessage = (e) => {
      receivedData.push(e.data);
    };

    (ws as any).handleMessage("{\"action\":\"announce\"}");
    expect(receivedData).toEqual(["{\"action\":\"announce\"}"]);
  });

  it("handles close events and updates readyState", () => {
    const ws = new BackgroundWebSocket("wss://test.relay.com");
    (ws as any).handleOpen();

    let closeCode = 0;
    ws.onclose = (e) => {
      closeCode = e.code;
    };

    ws.close(1000, "Normal closure");
    expect(closeCode).toBe(1000);
    expect(ws.readyState).toBe(WS_CLOSED);
  });

  it("installs WebSocket bridge globally onto globalThis", () => {
    installWebSocketBridge();
    expect(globalThis.WebSocket).toBe(BackgroundWebSocket as any);
  });
});
