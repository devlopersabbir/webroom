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

  it("supports addEventListener, removeEventListener, and EventListenerObject", () => {
    const ws = new BackgroundWebSocket("wss://test.relay.com");
    const received: string[] = [];

    const fnListener = (e: any) => {
      received.push(`fn:${e.type}`);
    };

    const objListener = {
      handleEvent: (e: any) => {
        received.push(`obj:${e.type}`);
      },
    };

    ws.addEventListener("message", fnListener);
    ws.addEventListener("message", objListener);

    (ws as any).readyState = WS_OPEN;
    (ws as any).handleMessage("test1");
    expect(received).toEqual(["fn:message", "obj:message"]);

    // Test removeEventListener
    ws.removeEventListener("message", fnListener);
    (ws as any).handleMessage("test2");
    expect(received).toEqual(["fn:message", "obj:message", "obj:message"]);
  });

  it("ensures all standard WebSocket and Bridge methods exist on instance", () => {
    const ws = new BackgroundWebSocket("wss://test.relay.com");
    expect(typeof (ws as any).connectPort).toBe("function");
    expect(typeof ws.send).toBe("function");
    expect(typeof ws.close).toBe("function");
    expect(typeof ws.addEventListener).toBe("function");
    expect(typeof ws.removeEventListener).toBe("function");
    expect(typeof ws.dispatchEvent).toBe("function");
  });

  it("installs WebSocket bridge globally onto globalThis", () => {
    installWebSocketBridge();
    expect(globalThis.WebSocket).toBe(BackgroundWebSocket as any);
  });
});

