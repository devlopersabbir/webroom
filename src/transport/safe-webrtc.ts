/**
 * Safely sanitizes incoming RTCDataChannel data to prevent Firefox WebExtension
 * content script Xray wrapper security errors (`Permission denied to access property "constructor"`).
 *
 * In Firefox content scripts, ArrayBuffers delivered via native RTCDataChannel events
 * originate from the content window's security compartment. Attempting to construct
 * a `Uint8Array` directly from an Xrayed `ArrayBuffer` throws a security violation
 * when SpiderMonkey tries to access `.constructor` on the foreign prototype.
 *
 * Using `structuredClone()` clones the underlying buffer across compartments
 * into a clean, unprivileged local `ArrayBuffer` owned by the content script.
 */
export function sanitizeChannelData(data: any): any {
  if (data === null || data === undefined || typeof data === "string") {
    return data;
  }

  // structuredClone safely extracts raw binary data across Gecko security compartments
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback if structuredClone encounters an uncloneable type
    }
  }

  // Fallback for environments without structuredClone (or mock environments)
  try {
    if (data instanceof ArrayBuffer || typeof data.byteLength === "number") {
      const src = new Uint8Array(data);
      const copy = new ArrayBuffer(src.byteLength);
      new Uint8Array(copy).set(src);
      return copy;
    }
  } catch {
    // Return original if fallback fails
  }

  return data;
}

function createSafeMessageEvent(event: any): any {
  if (!event) return event;
  const rawData = event.data;
  const safeData = sanitizeChannelData(rawData);
  if (safeData === rawData) {
    return event;
  }

  return new Proxy(event, {
    get(target, prop) {
      if (prop === "data") {
        return safeData;
      }
      const val = (target as any)[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}

/**
 * Wraps an RTCDataChannel so that all incoming data events deliver sanitized,
 * compartment-safe ArrayBuffers.
 */
export function wrapDataChannel(channel: any): any {
  if (!channel || channel.__webroom_safe_wrapped) {
    return channel;
  }

  const listenerMap = new WeakMap<Function, Function>();

  const wrapped = new Proxy(channel, {
    get(target, prop) {
      if (prop === "__webroom_safe_wrapped") {
        return true;
      }

      if (prop === "onmessage") {
        return target.onmessage;
      }

      if (prop === "addEventListener") {
        return function (type: string, listener: any, options?: any) {
          if (type === "message" && typeof listener === "function") {
            let safeListener = listenerMap.get(listener);
            if (!safeListener) {
              safeListener = function (this: any, event: any) {
                const safeEvent = createSafeMessageEvent(event);
                listener.call(this, safeEvent);
              };
              listenerMap.set(listener, safeListener);
            }
            return target.addEventListener(type, safeListener, options);
          }
          if (type === "message" && listener && typeof listener.handleEvent === "function") {
            let safeListener = listenerMap.get(listener.handleEvent);
            if (!safeListener) {
              safeListener = function (this: any, event: any) {
                const safeEvent = createSafeMessageEvent(event);
                listener.handleEvent(safeEvent);
              };
              listenerMap.set(listener.handleEvent, safeListener);
            }
            return target.addEventListener(type, safeListener, options);
          }
          return target.addEventListener(type, listener, options);
        };
      }

      if (prop === "removeEventListener") {
        return function (type: string, listener: any, options?: any) {
          if (type === "message") {
            const key = typeof listener === "function" ? listener : listener?.handleEvent;
            const safeListener = key ? listenerMap.get(key) : null;
            if (safeListener) {
              return target.removeEventListener(type, safeListener, options);
            }
          }
          return target.removeEventListener(type, listener, options);
        };
      }

      const value = (target as any)[prop];
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },

    set(target, prop, value) {
      if (prop === "onmessage") {
        if (typeof value === "function") {
          target.onmessage = function (this: any, event: any) {
            const safeEvent = createSafeMessageEvent(event);
            value.call(this, safeEvent);
          };
        } else {
          target.onmessage = value;
        }
        return true;
      }
      (target as any)[prop] = value;
      return true;
    },
  });

  return wrapped;
}

/**
 * A drop-in replacement for `RTCPeerConnection` that intercepts data channels
 * and sanitizes binary data frames before delivering them to application handlers.
 */
export class SafeRTCPeerConnection {
  constructor(config?: RTCConfiguration) {
    const NativePC =
      (SafeRTCPeerConnection as any)._NativeRTCPeerConnection ||
      (typeof window !== "undefined" ? window.RTCPeerConnection : null) ||
      (typeof globalThis !== "undefined" ? (globalThis as any).RTCPeerConnection : null);

    if (!NativePC) {
      throw new Error("[WebRoom WebRTC] RTCPeerConnection is not available in this environment");
    }

    const pc = new NativePC(config);
    if (!pc || typeof pc !== "object") {
      return pc;
    }

    return new Proxy(pc, {
      get(target, prop) {
        if (prop === "createDataChannel") {
          return function (label: string, dataChannelDict?: RTCDataChannelInit) {
            const rawChannel = target.createDataChannel(label, dataChannelDict);
            return wrapDataChannel(rawChannel);
          };
        }

        if (prop === "ondatachannel") {
          return target.ondatachannel;
        }

        if (prop === "addEventListener") {
          return function (type: string, listener: any, options?: any) {
            if (type === "datachannel" && typeof listener === "function") {
              const safeListener = function (this: any, event: any) {
                if (event && event.channel) {
                  const safeEvent = new Proxy(event, {
                    get(evtTarget, evtProp) {
                      if (evtProp === "channel") {
                        return wrapDataChannel(evtTarget.channel);
                      }
                      const val = (evtTarget as any)[evtProp];
                      return typeof val === "function" ? val.bind(evtTarget) : val;
                    },
                  });
                  return listener.call(this, safeEvent);
                }
                return listener.call(this, event);
              };
              return target.addEventListener(type, safeListener, options);
            }
            return target.addEventListener(type, listener, options);
          };
        }

        const value = (target as any)[prop];
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },

      set(target, prop, value) {
        if (prop === "ondatachannel") {
          if (typeof value === "function") {
            target.ondatachannel = function (this: any, event: any) {
              if (event && event.channel) {
                const safeEvent = new Proxy(event, {
                  get(evtTarget, evtProp) {
                    if (evtProp === "channel") {
                      return wrapDataChannel(evtTarget.channel);
                    }
                    const val = (evtTarget as any)[evtProp];
                    return typeof val === "function" ? val.bind(evtTarget) : val;
                  },
                });
                return value.call(this, safeEvent);
              }
              return value.call(this, event);
            };
          } else {
            target.ondatachannel = value;
          }
          return true;
        }
        (target as any)[prop] = value;
        return true;
      },
    });
  }
}

let isWebRTCBridgeInstalled = false;

/**
 * Installs the SafeRTCPeerConnection globally onto `window.RTCPeerConnection` and `globalThis.RTCPeerConnection`.
 */
export function installWebRTCBridge(): void {
  if (isWebRTCBridgeInstalled) {
    return;
  }

  const globalScope =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
      ? window
      : (self as any);

  if (globalScope && globalScope.RTCPeerConnection) {
    const originalPC = globalScope.RTCPeerConnection;
    (SafeRTCPeerConnection as any)._NativeRTCPeerConnection = originalPC;
    globalScope.RTCPeerConnection = SafeRTCPeerConnection as any;
    isWebRTCBridgeInstalled = true;
  }
}
