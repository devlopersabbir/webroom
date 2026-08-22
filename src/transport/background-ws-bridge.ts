declare const chrome: any;

function getExtensionRuntime(): any {
  if (typeof chrome !== "undefined" && chrome?.runtime) {
    return chrome.runtime;
  }
  if (typeof (globalThis as any).browser !== "undefined" && (globalThis as any).browser?.runtime) {
    return (globalThis as any).browser.runtime;
  }
  return null;
}

/**
 * WebSocket state constants matching the standard WebSocket API.
 */
export const WS_CONNECTING = 0;
export const WS_OPEN = 1;
export const WS_CLOSING = 2;
export const WS_CLOSED = 3;

export interface BridgeMessageEvent {
  data: string | ArrayBuffer;
  type: string;
}

export interface BridgeCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
  type: string;
}

/**
 * A standard-compliant WebSocket proxy that delegates network connections to the
 * background extension service worker via runtime ports.
 *
 * This completely bypasses the host webpage's Content Security Policy (CSP)
 * connect-src restrictions in content scripts.
 */
function createCustomEvent(type: string): Event {
  try {
    return new Event(type);
  } catch {
    return { type, defaultPrevented: false } as Event;
  }
}

function createCustomMessageEvent(data: any): MessageEvent {
  try {
    return new MessageEvent("message", { data });
  } catch {
    return { type: "message", data, defaultPrevented: false } as MessageEvent;
  }
}

function createCustomCloseEvent(code: number, reason: string, wasClean: boolean): CloseEvent {
  try {
    return new CloseEvent("close", { code, reason, wasClean });
  } catch {
    return { type: "close", code, reason, wasClean, defaultPrevented: false } as CloseEvent;
  }
}

/**
 * A standard-compliant WebSocket proxy that delegates network connections to the
 * background extension service worker via runtime ports.
 *
 * This completely bypasses the host webpage's Content Security Policy (CSP)
 * connect-src restrictions in content scripts.
 *
 * Implements EventTarget directly in pure JS to avoid Firefox WebExtension
 * content script Xray wrapper prototype bugs when subclassing native DOM classes.
 */
export class BackgroundWebSocket implements EventTarget {
  public static readonly CONNECTING = WS_CONNECTING;
  public static readonly OPEN = WS_OPEN;
  public static readonly CLOSING = WS_CLOSING;
  public static readonly CLOSED = WS_CLOSED;

  public readonly CONNECTING = WS_CONNECTING;
  public readonly OPEN = WS_OPEN;
  public readonly CLOSING = WS_CLOSING;
  public readonly CLOSED = WS_CLOSED;

  public readonly url: string;
  public readyState: number = WS_CONNECTING;
  public bufferedAmount = 0;
  public protocol = "";
  public binaryType: "blob" | "arraybuffer" = "arraybuffer";

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  private port: any = null;
  private isCleanClosed = false;
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = typeof url === "string" ? url : url.toString();

    this.connectPort(protocols);
  }

  public addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (!callback) return;
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(callback);
  }

  public removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    _options?: boolean | EventListenerOptions,
  ): void {
    if (!callback) return;
    const set = this.listeners.get(type);
    if (set) {
      set.delete(callback);
    }
  }

  public dispatchEvent(event: Event): boolean {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          if (typeof listener === "function") {
            listener.call(this, event);
          } else if (listener && typeof (listener as EventListenerObject).handleEvent === "function") {
            (listener as EventListenerObject).handleEvent(event);
          }
        } catch (err) {
          console.error(`[WebRoom WS Bridge] Error in ${event.type} listener:`, err);
        }
      }
    }
    return !event.defaultPrevented;
  }

  private connectPort(protocols?: string | string[]): void {
    try {
      const runtime = getExtensionRuntime();

      if (!runtime || !runtime.connect) {
        // Fallback to native WebSocket if extension runtime is unavailable (e.g. unit tests)
        this.fallbackToNativeWebSocket(protocols);
        return;
      }

      this.port = runtime.connect({ name: "webroom-ws-bridge" });

      this.port.onMessage.addListener((msg: any) => {
        this.handlePortMessage(msg);
      });

      this.port.onDisconnect.addListener(() => {
        if (this.readyState !== WS_CLOSED) {
          this.handleClose(1006, "Background port disconnected", false);
        }
      });

      // Initiate connection in the background script
      this.port.postMessage({
        type: "init",
        url: this.url,
        protocols: Array.isArray(protocols) ? protocols : protocols ? [protocols] : [],
      });
    } catch (err) {
      console.warn("[WebRoom WS Bridge] Failed to connect to background script, falling back to native WebSocket:", err);
      this.fallbackToNativeWebSocket(protocols);
    }
  }

  private fallbackToNativeWebSocket(protocols?: string | string[]): void {
    const NativeWS = (BackgroundWebSocket as any)._NativeWebSocket || (typeof window !== "undefined" ? window.WebSocket : null);
    if (!NativeWS) {
      setTimeout(() => {
        this.handleError(new Error("No WebSocket implementation available"));
        this.handleClose(1006, "No WebSocket available", false);
      }, 0);
      return;
    }

    try {
      const ws = new NativeWS(this.url, protocols);
      ws.onopen = (e: any) => this.handleOpen();
      ws.onmessage = (e: any) => this.handleMessage(e.data);
      ws.onerror = (e: any) => this.handleError(e);
      ws.onclose = (e: any) => this.handleClose(e.code, e.reason, e.wasClean);

      // Re-route send/close to native socket
      this.send = (data: any) => ws.send(data);
      this.close = (code?: number, reason?: string) => ws.close(code, reason);
    } catch (err) {
      setTimeout(() => {
        this.handleError(err);
        this.handleClose(1006, "Failed to initialize native socket", false);
      }, 0);
    }
  }

  private handlePortMessage(msg: any): void {
    switch (msg.type) {
      case "open":
        this.protocol = msg.protocol || "";
        this.handleOpen();
        break;
      case "message":
        if (msg.isBinary && typeof msg.data === "string") {
          const len = msg.data.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = msg.data.charCodeAt(i);
          }
          this.handleMessage(bytes.buffer);
        } else {
          this.handleMessage(msg.data);
        }
        break;
      case "error":
        this.handleError(msg.error || "WebSocket error in background");
        break;
      case "close":
        this.handleClose(msg.code ?? 1000, msg.reason ?? "", msg.wasClean ?? true);
        break;
    }
  }

  private handleOpen(): void {
    if (this.readyState !== WS_CONNECTING) return;
    this.readyState = WS_OPEN;

    const event = createCustomEvent("open");
    if (this.onopen) {
      try {
        this.onopen(event);
      } catch (err) {
        console.error("[WebRoom WS Bridge] Error in onopen callback:", err);
      }
    }
    this.dispatchEvent(event);
  }

  private handleMessage(data: any): void {
    if (this.readyState !== WS_OPEN) return;

    const event = createCustomMessageEvent(data);
    if (this.onmessage) {
      try {
        this.onmessage(event);
      } catch (err) {
        console.error("[WebRoom WS Bridge] Error in onmessage callback:", err);
      }
    }
    this.dispatchEvent(event);
  }

  private handleError(errorDetails: any): void {
    console.warn(`[WebRoom WS Bridge] Bridge WebSocket error on ${this.url}:`, errorDetails);
    const event = createCustomEvent("error");
    (event as any).error = errorDetails;
    if (this.onerror) {
      try {
        this.onerror(event);
      } catch (err) {
        console.error("[WebRoom WS Bridge] Error in onerror callback:", err);
      }
    }
    this.dispatchEvent(event);
  }

  private handleClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
    this.isCleanClosed = wasClean;

    const event = createCustomCloseEvent(code, reason, wasClean);

    if (this.onclose) {
      try {
        this.onclose(event);
      } catch (err) {
        console.error("[WebRoom WS Bridge] Error in onclose callback:", err);
      }
    }
    this.dispatchEvent(event);

    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.port = null;
    }
  }

  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== WS_OPEN) {
      throw new Error(`[WebRoom WS Bridge] InvalidStateError: WebSocket is not open (state: ${this.readyState})`);
    }

    if (this.port) {
      if (typeof data === "string") {
        this.port.postMessage({ type: "send", data });
      } else if (data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to binary string or array for message port serialization
        const bytes = new Uint8Array(data);
        let binaryStr = "";
        for (let i = 0; i < bytes.length; i++) {
          binaryStr += String.fromCharCode(bytes[i]);
        }
        this.port.postMessage({ type: "send", data: binaryStr, isBinary: true });
      } else if (ArrayBuffer.isView(data)) {
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        let binaryStr = "";
        for (let i = 0; i < bytes.length; i++) {
          binaryStr += String.fromCharCode(bytes[i]);
        }
        this.port.postMessage({ type: "send", data: binaryStr, isBinary: true });
      } else {
        this.port.postMessage({ type: "send", data: String(data) });
      }
    }
  }

  public close(code: number = 1000, reason: string = ""): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) {
      return;
    }

    this.readyState = WS_CLOSING;
    if (this.port) {
      try {
        this.port.postMessage({ type: "close", code, reason });
      } catch {
        // Ignore send errors during close
      }
    }

    this.handleClose(code, reason, true);
  }
}

/**
 * Installs the BackgroundWebSocket bridge globally on the current JS context
 * so that any P2P/WebRTC signaling library (such as Trystero) automatically
 * routes WebSocket connections through the extension background service worker.
 */
let isBridgeInstalled = false;

export function installWebSocketBridge(): void {
  if (isBridgeInstalled) {
    return;
  }

  const globalScope = typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : (self as any);

  if (globalScope) {
    const originalWS = globalScope.WebSocket;
    (BackgroundWebSocket as any)._NativeWebSocket = originalWS;
    globalScope.WebSocket = BackgroundWebSocket as any;
    isBridgeInstalled = true;
  }
}
