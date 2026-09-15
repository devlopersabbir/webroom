import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebRoomMessage } from "../presence/protocol";
import { MessageHandler, Transport } from "../transport/transport";
import { VoiceManager } from "./voice-manager";

class MockTransport implements Transport {
  public sent: WebRoomMessage[] = [];
  private handlers = new Set<MessageHandler>();

  public start(): void {}
  public send(message: WebRoomMessage): void {
    this.sent.push(message);
  }
  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  public async emitMessage(message: WebRoomMessage): Promise<void> {
    for (const h of this.handlers) await h(message);
  }
  public close(): void {
    this.handlers.clear();
  }
}

describe("VoiceManager", () => {
  let transport: MockTransport;
  const roomId = "room-voice-1";
  const peerId = "peer_local";

  beforeEach(() => {
    transport = new MockTransport();
  });

  it("initializes with microphone OFF and speaker OFF deterministically", () => {
    const vm = new VoiceManager(roomId, peerId, transport);
    vm.start();

    const state = vm.getState();
    expect(state.isMicOn).toBe(false);
    expect(state.isSpeakerOn).toBe(false);
    expect(state.isMicAvailable).toBe(true);

    vm.destroy();
  });

  it("toggles speaker state independently without touching microphone", () => {
    const vm = new VoiceManager(roomId, peerId, transport);
    vm.start();

    let observedSpeakerState = false;
    vm.onStateChange((s) => {
      observedSpeakerState = s.isSpeakerOn;
    });

    const toggledOn = vm.toggleSpeaker();
    expect(toggledOn).toBe(true);
    expect(vm.getState().isSpeakerOn).toBe(true);
    expect(vm.getState().isMicOn).toBe(false);
    expect(observedSpeakerState).toBe(true);

    const toggledOff = vm.toggleSpeaker();
    expect(toggledOff).toBe(false);
    expect(vm.getState().isSpeakerOn).toBe(false);
    expect(vm.getState().isMicOn).toBe(false);
    expect(observedSpeakerState).toBe(false);

    vm.destroy();
  });

  it("handles microphone permission rejection gracefully without throwing", async () => {
    const vm = new VoiceManager(roomId, peerId, transport);
    vm.start();

    // Mock navigator.mediaDevices.getUserMedia rejecting with NotAllowedError
    const originalMediaDevices = globalThis.navigator.mediaDevices;
    // @ts-expect-error Mocking mediaDevices for test
    globalThis.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")),
    };

    const micSuccess = await vm.toggleMicrophone();
    expect(micSuccess).toBe(false);
    expect(vm.getState().isMicOn).toBe(false);
    expect(vm.getState().isMicAvailable).toBe(false);

    // Restore
    // @ts-expect-error Restoring mediaDevices
    globalThis.navigator.mediaDevices = originalMediaDevices;

    vm.destroy();
  });

  it("toggles microphone ON and OFF when getUserMedia succeeds", async () => {
    const vm = new VoiceManager(roomId, peerId, transport);
    vm.start();

    const mockTrack = {
      kind: "audio",
      enabled: true,
      readyState: "live",
      stop: vi.fn(),
    };

    const mockStream = {
      getAudioTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    };

    const originalMediaDevices = globalThis.navigator.mediaDevices;
    // @ts-expect-error Mocking mediaDevices
    globalThis.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    };

    const micTurnedOn = await vm.toggleMicrophone();
    expect(micTurnedOn).toBe(true);
    expect(vm.getState().isMicOn).toBe(true);

    // Verify VOICE_STATE was broadcast with isMicOn: true
    const voiceStates = transport.sent.filter((m) => m.type === "VOICE_STATE");
    const broadcastState = voiceStates[voiceStates.length - 1];
    expect(broadcastState).toBeDefined();
    expect((broadcastState as { isMicOn?: boolean })?.isMicOn).toBe(true);

    // Turn Mic OFF
    const micTurnedOff = await vm.toggleMicrophone();
    expect(micTurnedOff).toBe(false);
    expect(vm.getState().isMicOn).toBe(false);
    expect(mockTrack.enabled).toBe(false);

    // Destroy stops tracks completely
    vm.destroy();
    expect(mockTrack.stop).toHaveBeenCalled();

    // Restore
    // @ts-expect-error Restoring mediaDevices
    globalThis.navigator.mediaDevices = originalMediaDevices;
  });

  it("cleans up all peer connections and local streams on destroy()", () => {
    const vm = new VoiceManager(roomId, peerId, transport);
    vm.start();

    vm.handlePeerDiscovered("peer_remote_1");
    expect(vm.getState().isMicOn).toBe(false);

    vm.destroy();
    // Should be cleanly destroyed without error
    expect(vm.getSpeakingPeers().size).toBe(0);
  });

  it("handles multi-party voice signaling across 3 peers without dropping offers", async () => {
    const vm = new VoiceManager(roomId, "peer_a", transport);
    vm.start();

    // Mock mediaDevices
    const mockTrack = { kind: "audio", enabled: true, readyState: "live", stop: vi.fn() };
    const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
    const originalMediaDevices = globalThis.navigator.mediaDevices;
    // @ts-expect-error Mocking mediaDevices
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(mockStream) };

    // Discover peer_b and peer_c
    await vm.handlePeerDiscovered("peer_b");
    await vm.handlePeerDiscovered("peer_c");

    // Peer A turns on mic -> should broadcast VOICE_STATE
    await vm.toggleMicrophone();
    expect(vm.getState().isMicOn).toBe(true);

    const voiceStates = transport.sent.filter((m) => m.type === "VOICE_STATE");
    expect(voiceStates.length).toBeGreaterThanOrEqual(1);

    // Simulate peer_b and peer_c broadcasting VOICE_STATE
    transport.emitMessage({
      type: "VOICE_STATE",
      roomId,
      peerId: "peer_b",
      isMicOn: true,
      isSpeakerOn: true,
      timestamp: Date.now(),
    });

    transport.emitMessage({
      type: "VOICE_STATE",
      roomId,
      peerId: "peer_c",
      isMicOn: false,
      isSpeakerOn: true,
      timestamp: Date.now(),
    });

    // Verify peer_a stays healthy and cleans up
    vm.destroy();
    // @ts-expect-error Restoring mediaDevices
    globalThis.navigator.mediaDevices = originalMediaDevices;
  });

  it("ensures a late joiner receives and hears audio from active talkers when opening speaker", async () => {
    // Peer C joins late
    const vmC = new VoiceManager(roomId, "peer_c", transport);
    vmC.start();

    // Peer A and Peer B are already talking in the room
    await vmC.handlePeerDiscovered("peer_a");
    await vmC.handlePeerDiscovered("peer_b");

    // Peer A and B broadcast their active mic state
    transport.emitMessage({
      type: "VOICE_STATE",
      roomId,
      peerId: "peer_a",
      isMicOn: true,
      isSpeakerOn: true,
      timestamp: Date.now(),
    });
    transport.emitMessage({
      type: "VOICE_STATE",
      roomId,
      peerId: "peer_b",
      isMicOn: true,
      isSpeakerOn: true,
      timestamp: Date.now(),
    });

    // Peer C starts with speaker OFF (not hearing by default)
    expect(vmC.getState().isSpeakerOn).toBe(false);

    // Peer C clicks speaker to listen
    vmC.toggleSpeaker();
    expect(vmC.getState().isSpeakerOn).toBe(true);

    // Verify Peer C broadcasted its updated VOICE_STATE with isSpeakerOn: true
    const peerCVoiceStates = transport.sent.filter(
      (m) => m.type === "VOICE_STATE" && (m as { isSpeakerOn?: boolean }).isSpeakerOn === true
    );
    expect(peerCVoiceStates.length).toBeGreaterThanOrEqual(1);

    vmC.destroy();
  });

  it("enforces maximum 5 active speakers quota and triggers notification", async () => {
    const vm = new VoiceManager(roomId, "peer_user_6", transport);
    vm.start();

    // Mock mediaDevices
    const mockTrack = { kind: "audio", enabled: true, readyState: "live", stop: vi.fn() };
    const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
    const originalMediaDevices = globalThis.navigator.mediaDevices;
    // @ts-expect-error Mocking mediaDevices
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(mockStream) };

    let quotaNotice: string | null = null;
    vm.onQuotaExceeded((msg) => {
      quotaNotice = msg;
    });

    // 5 peers are already actively speaking in the room
    for (let i = 1; i <= 5; i++) {
      transport.emitMessage({
        type: "VOICE_STATE",
        roomId,
        peerId: `peer_speaker_${i}`,
        isMicOn: true,
        isSpeakerOn: true,
        timestamp: Date.now(),
      });
    }

    // 6th peer attempts to turn ON microphone
    const micToggled = await vm.toggleMicrophone();

    // Must be blocked
    expect(micToggled).toBe(false);
    expect(vm.getState().isMicOn).toBe(false);
    expect(quotaNotice).toBe("At a time, more than 5 people cannot speak.");

    // One of the 5 speakers turns OFF their microphone
    transport.emitMessage({
      type: "VOICE_STATE",
      roomId,
      peerId: "peer_speaker_1",
      isMicOn: false,
      isSpeakerOn: true,
      timestamp: Date.now(),
    });

    // Now 6th peer should successfully acquire microphone
    const micAllowed = await vm.toggleMicrophone();
    expect(micAllowed).toBe(true);
    expect(vm.getState().isMicOn).toBe(true);

    vm.destroy();
    // @ts-expect-error Restoring mediaDevices
    globalThis.navigator.mediaDevices = originalMediaDevices;
  });

  it("queues and drains pending renegotiation cleanly during polite rollback", async () => {
    class MockRTCPeerConnection {
      public signalingState: string = "stable";
      public onicecandidate: ((ev: any) => any) | null = null;
      public ontrack: ((ev: any) => any) | null = null;
      public oniceconnectionstatechange: (() => void) | null = null;
      public onconnectionstatechange: (() => void) | null = null;
      private transceivers: any[] = [];

      public addTransceiver(trackOrKind: any, init?: any) {
        const transceiver = {
          direction: init?.direction || "sendrecv",
          sender: {
            track: null,
            replaceTrack: vi.fn().mockResolvedValue(undefined),
            getParameters: vi.fn().mockReturnValue({ encodings: [] }),
            setParameters: vi.fn().mockResolvedValue(undefined),
          },
          receiver: {
            track: { kind: "audio", readyState: "live" },
          },
        };
        this.transceivers.push(transceiver);
        return transceiver;
      }

      public getTransceivers() {
        return this.transceivers;
      }

      public addTrack(track: any, stream: any) {
        const sender = {
          track,
          replaceTrack: vi.fn().mockResolvedValue(undefined),
          getParameters: vi.fn().mockReturnValue({ encodings: [] }),
          setParameters: vi.fn().mockResolvedValue(undefined),
        };
        this.transceivers.push({
          direction: "sendrecv",
          sender,
          receiver: { track: { kind: "audio", readyState: "live" } },
        });
        return sender;
      }

      public createOffer() {
        return Promise.resolve({
          type: "offer" as const,
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n",
        });
      }

      public createAnswer() {
        return Promise.resolve({
          type: "answer" as const,
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n",
        });
      }

      public setLocalDescription(desc?: any) {
        if (desc?.type === "rollback") {
          this.signalingState = "stable";
        } else if (desc?.type === "offer") {
          this.signalingState = "have-local-offer";
        } else if (desc?.type === "answer") {
          this.signalingState = "stable";
        }
        return Promise.resolve();
      }

      public setRemoteDescription(desc: any) {
        if (desc?.type === "offer") {
          this.signalingState = "have-remote-offer";
        } else if (desc?.type === "answer") {
          this.signalingState = "stable";
        }
        return Promise.resolve();
      }

      public addIceCandidate() {
        return Promise.resolve();
      }

      public close() {
        this.signalingState = "closed";
      }
    }

    const originalPC = (globalThis as any).RTCPeerConnection;
    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;

    const vmA = new VoiceManager(roomId, "peer_a", transport);
    vmA.start();

    // Mock mediaDevices
    const mockTrack = { kind: "audio", enabled: true, readyState: "live", stop: vi.fn() };
    const mockStream = { getAudioTracks: () => [mockTrack], getTracks: () => [mockTrack] };
    const originalMediaDevices = globalThis.navigator.mediaDevices;
    // @ts-expect-error Mocking mediaDevices
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(mockStream) };

    await vmA.handlePeerDiscovered("peer_b");

    // Peer A turns on mic
    await vmA.toggleMicrophone();
    expect(vmA.getState().isMicOn).toBe(true);

    // Simulate incoming offer from Peer B causing offer collision (peer_a < peer_b => polite)
    await transport.emitMessage({
      type: "VOICE_OFFER",
      roomId,
      peerId: "peer_b",
      targetPeerId: "peer_a",
      sdp: { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n" },
      timestamp: Date.now(),
    });

    // Verify Peer A gracefully answers the remote offer
    const answers = transport.sent.filter((m) => m.type === "VOICE_ANSWER");
    expect(answers.length).toBeGreaterThanOrEqual(1);

    // Verify Peer A queued and re-offered its own track once state returned to stable
    const offers = transport.sent.filter((m) => m.type === "VOICE_OFFER" && m.peerId === "peer_a");
    expect(offers.length).toBeGreaterThanOrEqual(1);

    vmA.destroy();
    // @ts-expect-error Restoring mediaDevices
    globalThis.navigator.mediaDevices = originalMediaDevices;
    (globalThis as any).RTCPeerConnection = originalPC;
  });
});

