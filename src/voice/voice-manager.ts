import { Transport } from "../transport/transport";
import { DEFAULT_RTC_CONFIG } from "../transport/trystero-transport";
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

interface RemoteVoiceState {
  isMicOn: boolean;
  isSpeakerOn: boolean;
}

/**
 * Coordinates WebRTC real-time voice communication across peers in a WebRoom.
 * Supports independent microphone/speaker toggling, on-demand lazy mesh scaling,
 * WebRTC Perfect Negotiation (glare-free), and speech detection.
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

  private knownPeers = new Set<string>();
  private remoteVoiceStates = new Map<string, RemoteVoiceState>();
  private peerConnections = new Map<string, RTCPeerConnection>();
  private makingOffer = new Map<string, boolean>();
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
   * Lazily synchronizes WebRTC peer connections with all active peers.
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

      // Synchronize connections (tear down idle connections if neither speaking nor listening)
      this.syncAllPeerConnections();
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
            channelCount: 1,
            sampleRate: 48000,
          },
          video: false,
        });

        if (this.isDestroyed) {
          stream.getTracks().forEach((t) => t.stop());
          return false;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && "contentHint" in audioTrack) {
          audioTrack.contentHint = "speech";
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

      // Synchronize connections across all known peers
      await this.syncAllPeerConnections();
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
   * Lazily synchronizes WebRTC connections to receive streams.
   */
  public toggleSpeaker(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    this.isSpeakerOn = !this.isSpeakerOn;

    // Resume AudioContext during user gesture to comply with browser autoplay policies
    const ctx = StreamAudioAnalyser.getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // Update muted status and ensure smooth playback on all remote audio elements
    for (const audioElement of this.remoteAudioElements.values()) {
      audioElement.muted = !this.isSpeakerOn;
      audioElement.volume = 1.0;
      if (this.isSpeakerOn) {
        audioElement.play().catch(() => {});
      }
    }

    this.broadcastVoiceState();
    this.notifyStateListeners();

    // Synchronize connections across peers
    this.syncAllPeerConnections();
    return this.isSpeakerOn;
  }

  /**
   * Called when presence discovers a peer or receives a heartbeat.
   */
  public async handlePeerDiscovered(remotePeerId: string): Promise<void> {
    if (this.isDestroyed || remotePeerId === this.peerId) {
      return;
    }

    this.knownPeers.add(remotePeerId);
    await this.syncPeerConnection(remotePeerId);
  }

  /**
   * Called when presence notifies a peer left or timed out.
   */
  public handlePeerLeft(remotePeerId: string): void {
    this.knownPeers.delete(remotePeerId);
    this.remoteVoiceStates.delete(remotePeerId);
    this.makingOffer.delete(remotePeerId);
    this.closePeer(remotePeerId);
  }

  /**
   * Determines if a WebRTC connection should exist with a specific remote peer.
   * Connection is established on-demand only if audio needs to flow in either direction.
   */
  private shouldConnect(remotePeerId: string): boolean {
    const remote = this.remoteVoiceStates.get(remotePeerId);
    const remoteMic = remote?.isMicOn ?? false;
    const remoteSpeaker = remote?.isSpeakerOn ?? false;

    // 1. We are speaking and remote can listen (or remote is undiscovered/default listening)
    const localSending = this.isMicOn && (remoteSpeaker || remote === undefined);
    // 2. Remote is speaking and we are listening
    const localReceiving = this.isSpeakerOn && remoteMic;
    // 3. Both are speaking
    const bothSpeaking = this.isMicOn && remoteMic;

    return localSending || localReceiving || bothSpeaking;
  }

  /**
   * Synchronizes connection state with a specific remote peer.
   */
  private async syncPeerConnection(remotePeerId: string): Promise<void> {
    if (this.isDestroyed || remotePeerId === this.peerId) {
      return;
    }

    const needsConnection = this.shouldConnect(remotePeerId);
    let pc = this.peerConnections.get(remotePeerId);

    if (!needsConnection) {
      if (pc) {
        this.closePeer(remotePeerId);
      }
      return;
    }

    if (!pc) {
      const newPc = this.createPeerConnection(remotePeerId);
      if (!newPc) return;
      pc = newPc;
    }

    // Update transceiver track and direction
    const audioTrack =
      this.isMicOn && this.localStream ? this.localStream.getAudioTracks()[0] : null;

    try {
      const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
      const audioTransceiver = transceivers.find(
        (t) =>
          t.receiver?.track?.kind === "audio" ||
          t.sender?.track?.kind === "audio" ||
          (t as any).mid !== undefined
      );

      if (audioTransceiver) {
        if (audioTrack && this.isMicOn) {
          await audioTransceiver.sender.replaceTrack(audioTrack);
          audioTransceiver.direction = "sendrecv";
        } else {
          await audioTransceiver.sender.replaceTrack(null);
          audioTransceiver.direction = "recvonly";
        }
      } else if (audioTrack && this.isMicOn) {
        pc.addTrack(audioTrack, this.localStream!);
      }
    } catch (err) {
      console.warn(`[WebRoom Voice] Error updating transceivers for peer ${remotePeerId}:`, err);
    }

    // Deterministic Perfect Negotiation: polite peer initiates offers
    const isPolite = this.peerId < remotePeerId;
    if (isPolite) {
      await this.initiateOffer(remotePeerId, pc);
    }
  }

  private async syncAllPeerConnections(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const remotePeerId of this.knownPeers) {
      promises.push(this.syncPeerConnection(remotePeerId));
    }
    await Promise.all(promises);
  }

  private createPeerConnection(remotePeerId: string): RTCPeerConnection | null {
    if (typeof RTCPeerConnection === "undefined") {
      return null;
    }

    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    this.peerConnections.set(remotePeerId, pc);

    // Initial transceiver configuration
    try {
      if (this.isMicOn && this.localStream && this.localStream.getAudioTracks().length > 0) {
        const track = this.localStream.getAudioTracks()[0];
        if (track) {
          if ("contentHint" in track) {
            track.contentHint = "speech";
          }
          pc.addTrack(track, this.localStream);
        }
      } else if (pc.addTransceiver) {
        pc.addTransceiver("audio", { direction: "recvonly" });
      }
    } catch (err) {
      console.warn(`[WebRoom Voice] Failed to configure initial transceiver for peer ${remotePeerId}:`, err);
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
    if (this.isDestroyed || !pc) {
      return;
    }

    try {
      this.makingOffer.set(remotePeerId, true);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });

      if (pc.signalingState !== "stable" && pc.signalingState !== "have-local-offer") {
        return;
      }

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
    } finally {
      this.makingOffer.set(remotePeerId, false);
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
    audioElement.volume = 1.0;
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
    this.knownPeers.add(msg.peerId);

    let pc = this.peerConnections.get(msg.peerId);
    if (!pc) {
      const newPc = this.createPeerConnection(msg.peerId);
      if (!newPc) return;
      pc = newPc;
    }

    // WebRTC Perfect Negotiation: Glare Handling
    const isPolite = this.peerId < msg.peerId;
    const isMakingOffer = this.makingOffer.get(msg.peerId) || false;
    const offerCollision = isMakingOffer || pc.signalingState !== "stable";

    if (offerCollision) {
      if (!isPolite) {
        // Impolite peer ignores colliding offer
        return;
      }
      // Polite peer rolls back local offer
      try {
        await pc.setLocalDescription({ type: "rollback" });
      } catch (err) {
        console.warn(`[WebRoom Voice] Rollback error for peer ${msg.peerId}:`, err);
      }
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
    this.knownPeers.add(msg.peerId);
    this.remoteVoiceStates.set(msg.peerId, {
      isMicOn: msg.isMicOn,
      isSpeakerOn: msg.isSpeakerOn ?? false,
    });

    if (!msg.isMicOn) {
      if (this.speakingPeers.delete(msg.peerId)) {
        this.notifySpeakingListeners();
      }
    }

    // Synchronize peer connection with this peer based on updated voice state
    this.syncPeerConnection(msg.peerId);
  }

  private broadcastVoiceState(): void {
    if (this.isDestroyed) return;
    const msg: VoiceStateMessage = {
      type: "VOICE_STATE",
      roomId: this.roomId,
      peerId: this.peerId,
      isMicOn: this.isMicOn,
      isSpeakerOn: this.isSpeakerOn,
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
    this.makingOffer.delete(remotePeerId);

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

    this.knownPeers.clear();
    this.remoteVoiceStates.clear();
    this.makingOffer.clear();
    this.stateListeners.clear();
    this.speakingListeners.clear();
    this.speakingPeers.clear();
  }
}
