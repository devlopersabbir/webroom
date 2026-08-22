import { describe, expect, it, vi } from "vitest";
import {
  installWebRTCBridge,
  SafeRTCPeerConnection,
  sanitizeChannelData,
  wrapDataChannel,
} from "./safe-webrtc";

describe("SafeRTCPeerConnection & WebRTC sanitization", () => {
  it("sanitizes null, undefined, and primitive string data without mutation", () => {
    expect(sanitizeChannelData(null)).toBe(null);
    expect(sanitizeChannelData(undefined)).toBe(undefined);
    expect(sanitizeChannelData("hello world")).toBe("hello world");
  });

  it("safely clones ArrayBuffers into local compartment buffers", () => {
    const src = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const cloned = sanitizeChannelData(src);

    expect(cloned).toBeInstanceOf(ArrayBuffer);
    expect(cloned).not.toBe(src);
    expect(new Uint8Array(cloned)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("wraps RTCDataChannel onmessage handler to sanitize incoming binary frames", () => {
    const mockChannel: any = {
      binaryType: "arraybuffer",
      onmessage: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const wrapped = wrapDataChannel(mockChannel);

    let receivedData: any = null;
    wrapped.onmessage = (event: any) => {
      receivedData = event.data;
    };

    const originalBuffer = new Uint8Array([10, 20, 30]).buffer;
    // Trigger raw onmessage on target
    mockChannel.onmessage({ data: originalBuffer });

    expect(receivedData).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(receivedData)).toEqual(new Uint8Array([10, 20, 30]));
  });

  it("wraps RTCDataChannel addEventListener for message events", () => {
    const mockChannel: any = {
      binaryType: "arraybuffer",
      onmessage: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const wrapped = wrapDataChannel(mockChannel);

    const listener = vi.fn();
    wrapped.addEventListener("message", listener);

    expect(mockChannel.addEventListener).toHaveBeenCalledTimes(1);
    const registeredHandler = mockChannel.addEventListener.mock.calls[0][1];

    const originalBuffer = new Uint8Array([99, 100]).buffer;
    registeredHandler({ data: originalBuffer });

    expect(listener).toHaveBeenCalledTimes(1);
    const passedEvent = listener.mock.calls[0][0];
    expect(new Uint8Array(passedEvent.data)).toEqual(new Uint8Array([99, 100]));
  });

  it("forwards WebIDL getters and setters with this bound to target object", () => {
    let capturedThisInGetter: any = null;
    let capturedThisInSetter: any = null;

    class FakeNativeWebIDLPC {
      private _signalingState = "stable";
      public onicecandidate: any = null;

      get signalingState() {
        capturedThisInGetter = this;
        if (!(this instanceof FakeNativeWebIDLPC)) {
          throw new TypeError("'get signalingState' called on an object that does not implement interface RTCPeerConnection.");
        }
        return this._signalingState;
      }

      set onicecandidateHandler(val: any) {
        capturedThisInSetter = this;
        if (!(this instanceof FakeNativeWebIDLPC)) {
          throw new TypeError("'set onicecandidate' called on an object that does not implement interface RTCPeerConnection.");
        }
        this.onicecandidate = val;
      }
    }

    const originalPC = (globalThis as any).RTCPeerConnection;
    try {
      (globalThis as any).RTCPeerConnection = FakeNativeWebIDLPC;
      (SafeRTCPeerConnection as any)._NativeRTCPeerConnection = FakeNativeWebIDLPC;

      const pc: any = new SafeRTCPeerConnection();

      // Access getter
      expect(pc.signalingState).toBe("stable");
      expect(capturedThisInGetter).toBeInstanceOf(FakeNativeWebIDLPC);

      // Access setter
      const fn = () => {};
      pc.onicecandidateHandler = fn;
      expect(capturedThisInSetter).toBeInstanceOf(FakeNativeWebIDLPC);
    } finally {
      (globalThis as any).RTCPeerConnection = originalPC;
      (SafeRTCPeerConnection as any)._NativeRTCPeerConnection = originalPC;
    }
  });

  it("installs SafeRTCPeerConnection onto globalThis.RTCPeerConnection", () => {
    const originalPC = (globalThis as any).RTCPeerConnection;
    try {
      const fakeNativePC = vi.fn().mockImplementation(function (this: any) {
        return {
          createDataChannel: vi.fn().mockReturnValue({ onmessage: null }),
          addEventListener: vi.fn(),
        };
      });

      (globalThis as any).RTCPeerConnection = fakeNativePC;

      installWebRTCBridge();
      expect((globalThis as any).RTCPeerConnection).toBe(SafeRTCPeerConnection);

      const pc: any = new SafeRTCPeerConnection();
      const dc = pc.createDataChannel("data");
      expect(dc.__webroom_safe_wrapped).toBe(true);
    } finally {
      (globalThis as any).RTCPeerConnection = originalPC;
      (SafeRTCPeerConnection as any)._NativeRTCPeerConnection = originalPC;
    }
  });
});
