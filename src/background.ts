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

const runtime = getExtensionRuntime();

console.log("[WebRoom] Background service worker initialized");

if (runtime && runtime.onInstalled) {
  runtime.onInstalled.addListener((details: any) => {
    console.log("[WebRoom] Extension installed/updated:", details);
  });
}

/**
 * Background WebSocket Relay for Decentralized WebRTC Signaling.
 *
 * In Manifest V3, content scripts on third-party websites are subject to the host page's
 * Content Security Policy (CSP `connect-src`). Running WebSockets in the background
 * context guarantees that connections to BitTorrent trackers and signaling relays
 * are NEVER blocked by third-party website security policies.
 */
if (runtime && runtime.onConnect) {
  runtime.onConnect.addListener((port: any) => {
    if (port.name !== "webroom-ws-bridge") {
      return;
    }

    let socket: WebSocket | null = null;
    let isPortClosed = false;

    const cleanup = () => {
      if (socket) {
        try {
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
          }
        } catch {
          // Ignore close errors
        }
        socket = null;
      }
    };

    port.onDisconnect.addListener(() => {
      isPortClosed = true;
      cleanup();
    });

    port.onMessage.addListener((msg: any) => {
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case "init": {
          const { url, protocols } = msg;
          if (!url) return;

          try {
            cleanup();
            socket = protocols && protocols.length > 0
              ? new WebSocket(url, protocols)
              : new WebSocket(url);

            socket.onopen = () => {
              if (isPortClosed) return;
              try {
                port.postMessage({
                  type: "open",
                  protocol: socket?.protocol || "",
                });
              } catch {
                // Port might be closed
              }
            };

            socket.onmessage = (event: MessageEvent) => {
              if (isPortClosed) return;
              try {
                port.postMessage({
                  type: "message",
                  data: typeof event.data === "string" ? event.data : String(event.data),
                });
              } catch {
                // Port might be closed
              }
            };

            socket.onerror = (event: Event) => {
              if (isPortClosed) return;
              try {
                port.postMessage({
                  type: "error",
                  error: "WebSocket connection error",
                });
              } catch {
                // Port might be closed
              }
            };

            socket.onclose = (event: CloseEvent) => {
              if (isPortClosed) return;
              try {
                port.postMessage({
                  type: "close",
                  code: event.code,
                  reason: event.reason,
                  wasClean: event.wasClean,
                });
              } catch {
                // Port might be closed
              }
            };
          } catch (err: any) {
            if (!isPortClosed) {
              try {
                port.postMessage({
                  type: "error",
                  error: err?.message || "Failed to create WebSocket in background",
                });
                port.postMessage({
                  type: "close",
                  code: 1006,
                  reason: "Initialization failure",
                  wasClean: false,
                });
              } catch {
                // Port might be closed
              }
            }
          }
          break;
        }

        case "send": {
          if (socket && socket.readyState === WebSocket.OPEN) {
            try {
              if (msg.isBinary && typeof msg.data === "string") {
                const len = msg.data.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = msg.data.charCodeAt(i);
                }
                socket.send(bytes.buffer);
              } else {
                socket.send(msg.data);
              }
            } catch (err) {
              console.warn("[WebRoom Background WS] Failed to send data over socket:", err);
            }
          }
          break;
        }

        case "close": {
          if (socket) {
            try {
              socket.close(msg.code || 1000, msg.reason || "");
            } catch {
              // Ignore close error
            }
          }
          break;
        }
      }
    });
  });
}
