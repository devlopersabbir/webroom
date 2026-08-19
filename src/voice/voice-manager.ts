import { Transport } from "../transport/transport";
import { StreamAudioAnalyser } from "./audio-analyser";
import {
  isValidVoiceSignalingMessage,
  VoiceAnswerMessage,
  VoiceIceCandidateMessage,
  VoiceOfferMessage,
  VoiceSignalingMessage,
  VoiceStateMessage,
} from "./voice-protocol";

export interface VoiceState {
  isMicOn: boolean;
  isSpeakerOn: boolean;
  isMicAvailable: boolean;
}

export type VoiceStateListener = (state: VoiceState) => void;
export type SpeakingPeersListener = (speakingPeerIds: Set<string>) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

/**
 * Coordinates WebRTC real-time voice communication across peers in a WebRoom.
 * Supports independent microphone/speaker toggling, mesh signaling, and speech detection.
 */
export class VoiceManager {
  public readonly roomId: string;
  public readonly peerId: string;
  private readonly transport: Transport;

  private isMicOn = false;
  private isSpeakerOn = false;
  private isMicAvailable = true;

  private localStream: MediaStream | null = null;
  private localAnalyser: StreamAudioAnalyser | null = null;

  private peerConnections = new Map<string, RTCPeerConnection>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private remoteAudioElements = new Map<string, HTMLAudioElement>();
  private remoteAnalysers = new Map<string, StreamAudioAnalyser>();

  private speakingPeers = new Set<string>();

  private stateListeners = new Set<VoiceStateListener>();
  private speakingListeners = new Set<SpeakingPeersListener>();

  private unsubscribeTransport: (() => void) | null = null;
  private isDestroyed = false;

  constructor(roomId: string, peerId: string, transport: Transport) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.transport = transport;
  }

  /**
   * Initializes transport signaling listeners without requesting any microphone permissions.
   */
  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    this.unsubscribeTransport = this.transport.onMessage((msg) => {
      this.handleTransportMessage(msg);
    });

    this.notifyStateListeners();
  }

  public getState(): VoiceState {
    return {
      isMicOn: this.isMicOn,
      isSpeakerOn: this.isSpeakerOn,
      isMicAvailable: this.isMicAvailable,
    };
  }

  public getSpeakingPeers(): Set<string> {
    return new Set(this.speakingPeers);
  }

  public onStateChange(listener: VoiceStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onSpeakingChange(listener: SpeakingPeersListener): () => void {
    this.speakingListeners.add(listener);
    listener(this.getSpeakingPeers());
    return () => {
      this.speakingListeners.delete(listener);
    };
  }

  /**
   * Toggles the user's microphone state.
   * If turning ON and stream does not exist, requests microphone permission.
   */
  public async toggleMicrophone(): Promise<boolean> {
    if (this.isDestroyed) {
      return false;
    }

    if (this.isMicOn) {
      // Turn OFF: disable audio tracks
      this.isMicOn = false;
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      this.speakingPeers.delete(this.peerId);
      this.notifySpeakingListeners();
      this.broadcastVoiceState();
      this.notifyStateListeners();
      return false;
    }

    // Turning ON
    try {
      if (!this.localStream || this.localStream.getAudioTracks().every((t) => t.readyState === "ended")) {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia is not supported in this environment");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (this.isDestroyed) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }

        this.localStream = stream;

        // Setup local audio analyser for self speaking activity
        if (this.localAnalyser) {
          this.localAnalyser.destroy();
        }
        this.localAnalyser = new StreamAudioAnalyser(stream, (isSpeaking) => {
          if (this.isDestroyed || !this.isMicOn) return;
          if (isSpeaking) {
            this.speakingPeers.add(this.peerId);
          } else {
            this.speakingPeers.delete(this.peerId);
          }
          this.notifySpeakingListeners();
        });

        // Add tracks to all existing peer connections
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          for (const [targetPeerId, pc] of this.peerConnections) {
            const senders = pc.getSenders();
            const existingSender = senders.find((s) => s.track && s.track.kind === "audio");
            if (existingSender) {
              existingSender.replaceTrack(audioTrack).catch((err) => {
                console.warn(`[WebRoom Voice] Error replacing audio track for peer ${targetPeerId}:`, err);
              });
            } else {
              try {
                pc.addTrack(audioTrack, stream);
                // Renegotiate offer
                this.initiateOffer(targetPeerId, pc);
              } catch (err) {
                console.warn(`[WebRoom Voice] Error adding audio track to peer ${targetPeerId}:`, err);
              }
            }
          }
        }
      } else {
        // Re-enable existing live tracks
        this.localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      }

      this.isMicOn = true;
      this.isMicAvailable = true;
      this.broadcastVoiceState();
      this.notifyStateListeners();
      return true;
    } catch (err) {
      console.warn("[WebRoom Voice] Microphone access denied or unavailable:", err);
      this.isMicOn = false;
      this.isMicAvailable = false;
      this.notifyStateListeners();
      return false;
    }
  }

  /**
   * Toggles the user's speaker (remote audio playback) state.
   */
  public toggleSpeaker(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    this.isSpeakerOn = !this.isSpeakerOn;

    // Update muted status on all remote audio elements
    for (const audioElement of this.remoteAudioElements.values()) {
      audioElement.muted = !this.isSpeakerOn;
      if (this.isSpeakerOn) {
        audioElement.play().catch(() => {});
      }
    }

    this.notifyStateListeners();
    return this.isSpeakerOn;
  }

  /**
   * Called when presence discovers a peer or receives a heartbeat.
   */
  public async handlePeerDiscovered(remotePeerId: string): Promise<void> {
    if (this.isDestroyed || remotePeerId === this.peerId) {
      return;
    }

    if (this.peerConnections.has(remotePeerId)) {
      return;
    }

    const pc = this.createPeerConnection(remotePeerId);
    if (!pc) {
      return;
    }

    // Deterministic tie-breaker: the peer with the lexicographically smaller peerId initiates the offer
    if (this.peerId < remotePeerId) {
      await this.initiateOffer(remotePeerId, pc);
    }
  }

  /**
   * Called when presence notifies a peer left or timed out.
   */
  public handlePeerLeft(remotePeerId: string): void {
    this.closePeer(remotePeerId);
  }

  private createPeerConnection(remotePeerId: string): RTCPeerConnection | null {
    if (typeof RTCPeerConnection === "undefined") {
      return null;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(remotePeerId, pc);

    // Add local tracks if mic stream exists
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track) {
        try {
          pc.addTrack(track, this.localStream);
        } catch (err) {
          console.warn(`[WebRoom Voice] Failed to add track for peer ${remotePeerId}:`, err);
        }
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && !this.isDestroyed) {
        const message: VoiceIceCandidateMessage = {
          type: "VOICE_ICE_CANDIDATE",
          roomId: this.roomId,
          peerId: this.peerId,
          targetPeerId: remotePeerId,
          candidate: event.candidate.toJSON(),
          timestamp: Date.now(),
        };
        this.transport.send(message);
      }
    };

    pc.ontrack = (event) => {
      if (this.isDestroyed) return;
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.attachRemoteStream(remotePeerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.closePeer(remotePeerId);
      }
    };

    return pc;
  }

  private async initiateOffer(remotePeerId: string, pc: RTCPeerConnection): Promise<void> {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      const message: VoiceOfferMessage = {
        type: "VOICE_OFFER",
        roomId: this.roomId,
        peerId: this.peerId,
        targetPeerId: remotePeerId,
        sdp: offer,
        timestamp: Date.now(),
      };
      this.transport.send(message);
    } catch (err) {
      console.warn(`[WebRoom Voice] Failed to create/send offer to ${remotePeerId}:`, err);
    }
  }

  private attachRemoteStream(remotePeerId: string, stream: MediaStream): void {
    let audioElement = this.remoteAudioElements.get(remotePeerId);
    if (!audioElement) {
      audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.setAttribute("playsinline", "true");
      audioElement.style.display = "none";
      document.body.appendChild(audioElement);
      this.remoteAudioElements.set(remotePeerId, audioElement);
    }

    audioElement.srcObject = stream;
    audioElement.muted = !this.isSpeakerOn;

    if (this.isSpeakerOn) {
      audioElement.play().catch(() => {});
    }

    // Attach speech analyser
    const existingAnalyser = this.remoteAnalysers.get(remotePeerId);
    if (existingAnalyser) {
      existingAnalyser.destroy();
    }

    const analyser = new StreamAudioAnalyser(stream, (isSpeaking) => {
      if (this.isDestroyed) return;
      if (isSpeaking) {
        this.speakingPeers.add(remotePeerId);
      } else {
        this.speakingPeers.delete(remotePeerId);
      }
      this.notifySpeakingListeners();
    });

    this.remoteAnalysers.set(remotePeerId, analyser);
  }

  private async handleTransportMessage(msg: unknown): Promise<void> {
    if (this.isDestroyed || !isValidVoiceSignalingMessage(msg, this.roomId)) {
      return;
    }

    if (msg.peerId === this.peerId) {
      return;
    }

    if ("targetPeerId" in msg && msg.targetPeerId !== this.peerId) {
      return;
    }

    switch (msg.type) {
      case "VOICE_OFFER":
        await this.handleVoiceOffer(msg);
        break;
      case "VOICE_ANSWER":
        await this.handleVoiceAnswer(msg);
        break;
      case "VOICE_ICE_CANDIDATE":
        await this.handleVoiceIceCandidate(msg);
        break;
      case "VOICE_STATE":
        this.handleVoiceState(msg);
        break;
    }
  }

  private async handleVoiceOffer(msg: VoiceOfferMessage): Promise<void> {
    let pc = this.peerConnections.get(msg.peerId);
    if (!pc) {
      const newPc = this.createPeerConnection(msg.peerId);
      if (!newPc) return;
      pc = newPc;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

      // Flush pending ICE candidates if any were buffered
      const pending = this.pendingCandidates.get(msg.peerId) || [];
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      this.pendingCandidates.delete(msg.peerId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const response: VoiceAnswerMessage = {
        type: "VOICE_ANSWER",
        roomId: this.roomId,
        peerId: this.peerId,
        targetPeerId: msg.peerId,
        sdp: answer,
        timestamp: Date.now(),
      };
      this.transport.send(response);
    } catch (err) {
      console.warn(`[WebRoom Voice] Error handling offer from ${msg.peerId}:`, err);
    }
  }

  private async handleVoiceAnswer(msg: VoiceAnswerMessage): Promise<void> {
    const pc = this.peerConnections.get(msg.peerId);
    if (!pc) {
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

      // Flush pending ICE candidates
      const pending = this.pendingCandidates.get(msg.peerId) || [];
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      this.pendingCandidates.delete(msg.peerId);
    } catch (err) {
      console.warn(`[WebRoom Voice] Error setting remote description from answer from ${msg.peerId}:`, err);
    }
  }

  private async handleVoiceIceCandidate(msg: VoiceIceCandidateMessage): Promise<void> {
    const pc = this.peerConnections.get(msg.peerId);
    if (!pc || !pc.remoteDescription) {
      const current = this.pendingCandidates.get(msg.peerId) || [];
      current.push(msg.candidate);
      this.pendingCandidates.set(msg.peerId, current);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } catch (err) {
      console.warn(`[WebRoom Voice] Error adding ICE candidate from ${msg.peerId}:`, err);
    }
  }

  private handleVoiceState(msg: VoiceStateMessage): void {
    if (!msg.isMicOn) {
      this.speakingPeers.delete(msg.peerId);
      this.notifySpeakingListeners();
    }
  }

  private broadcastVoiceState(): void {
    if (this.isDestroyed) return;
    const msg: VoiceStateMessage = {
      type: "VOICE_STATE",
      roomId: this.roomId,
      peerId: this.peerId,
      isMicOn: this.isMicOn,
      timestamp: Date.now(),
    };
    this.transport.send(msg);
  }

  private closePeer(remotePeerId: string): void {
    const pc = this.peerConnections.get(remotePeerId);
    if (pc) {
      try {
        pc.close();
      } catch {}
      this.peerConnections.delete(remotePeerId);
    }

    this.pendingCandidates.delete(remotePeerId);

    const analyser = this.remoteAnalysers.get(remotePeerId);
    if (analyser) {
      analyser.destroy();
      this.remoteAnalysers.delete(remotePeerId);
    }

    const audioElement = this.remoteAudioElements.get(remotePeerId);
    if (audioElement) {
      try {
        audioElement.pause();
        audioElement.srcObject = null;
        audioElement.remove();
      } catch {}
      this.remoteAudioElements.delete(remotePeerId);
    }

    if (this.speakingPeers.delete(remotePeerId)) {
      this.notifySpeakingListeners();
    }
  }

  private notifyStateListeners(): void {
    const state = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("[WebRoom Voice] Error in state listener:", err);
      }
    }
  }

  private notifySpeakingListeners(): void {
    const current = this.getSpeakingPeers();
    for (const listener of this.speakingListeners) {
      try {
        listener(current);
      } catch (err) {
        console.error("[WebRoom Voice] Error in speaking listener:", err);
      }
    }
  }

  /**
   * Destroys the VoiceManager, stops hardware microphone tracks immediately,
   * closes all peer connections and cleans up DOM audio elements.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    // Release microphone tracks immediately (stops browser recording indicator)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    if (this.localAnalyser) {
      this.localAnalyser.destroy();
      this.localAnalyser = null;
    }

    // Close all peer connections
    for (const remotePeerId of Array.from(this.peerConnections.keys())) {
      this.closePeer(remotePeerId);
    }

    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }

    this.stateListeners.clear();
    this.speakingListeners.clear();
    this.speakingPeers.clear();
  }
}
