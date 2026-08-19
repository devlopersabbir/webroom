/**
 * Lightweight Web Audio API RMS Voice Activity Detector (VAD).
 * Determines when an audio stream contains active human speech vs background silence.
 */

export interface SpeechDetectorOptions {
  threshold?: number; // RMS threshold (default ~0.03)
  holdTimeMs?: number; // How long to stay "speaking" after sound drops (default ~300ms)
  intervalMs?: number; // Polling check interval (default ~80ms)
}

export class StreamAudioAnalyser {
  private static sharedAudioContext: AudioContext | null = null;

  private readonly stream: MediaStream;
  private readonly threshold: number;
  private readonly holdTimeMs: number;
  private readonly intervalMs: number;
  private readonly onSpeakingChange: (isSpeaking: boolean) => void;

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private buffer: Float32Array | null = null;

  private isSpeaking = false;
  private lastAboveThresholdTime = 0;
  private isDestroyed = false;

  constructor(
    stream: MediaStream,
    onSpeakingChange: (isSpeaking: boolean) => void,
    options: SpeechDetectorOptions = {}
  ) {
    this.stream = stream;
    this.onSpeakingChange = onSpeakingChange;
    this.threshold = options.threshold ?? 0.03;
    this.holdTimeMs = options.holdTimeMs ?? 350;
    this.intervalMs = options.intervalMs ?? 80;

    this.init();
  }

  private static getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }

    if (!StreamAudioAnalyser.sharedAudioContext || StreamAudioAnalyser.sharedAudioContext.state === "closed") {
      try {
        StreamAudioAnalyser.sharedAudioContext = new AudioCtx();
      } catch (err) {
        console.warn("[WebRoom Voice] Failed to create AudioContext:", err);
        return null;
      }
    }

    if (StreamAudioAnalyser.sharedAudioContext.state === "suspended") {
      StreamAudioAnalyser.sharedAudioContext.resume().catch(() => {});
    }

    return StreamAudioAnalyser.sharedAudioContext;
  }

  private init(): void {
    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    const ctx = StreamAudioAnalyser.getAudioContext();
    if (!ctx) {
      return;
    }

    try {
      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.4;
      this.buffer = new Float32Array(this.analyserNode.fftSize);

      this.sourceNode = ctx.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.analyserNode);

      this.intervalTimer = setInterval(() => {
        this.checkAudioLevel();
      }, this.intervalMs);
    } catch (err) {
      console.warn("[WebRoom Voice] Error initializing audio analyser:", err);
    }
  }

  private checkAudioLevel(): void {
    if (this.isDestroyed || !this.analyserNode || !this.buffer) {
      return;
    }

    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled || audioTrack.readyState !== "live") {
      if (this.isSpeaking) {
        this.setSpeaking(false);
      }
      return;
    }

    (this.analyserNode.getFloatTimeDomainData as (array: Float32Array) => void)(this.buffer);

    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const val = this.buffer[i];
      sum += val * val;
    }
    const rms = Math.sqrt(sum / this.buffer.length);
    const now = Date.now();

    if (rms > this.threshold) {
      this.lastAboveThresholdTime = now;
      if (!this.isSpeaking) {
        this.setSpeaking(true);
      }
    } else if (this.isSpeaking && now - this.lastAboveThresholdTime > this.holdTimeMs) {
      this.setSpeaking(false);
    }
  }

  private setSpeaking(val: boolean): void {
    this.isSpeaking = val;
    try {
      this.onSpeakingChange(val);
    } catch (err) {
      console.error("[WebRoom Voice] Error in speaking listener:", err);
    }
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {}
      this.analyserNode = null;
    }

    if (this.isSpeaking) {
      this.setSpeaking(false);
    }
  }
}
