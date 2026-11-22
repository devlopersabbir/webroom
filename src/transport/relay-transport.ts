import { isValidWebRoomMessage, WebRoomMessage } from "../presence/protocol";
import {
  DEFAULT_RELAY_URL,
  RELAY_URL_STORAGE_KEY,
} from "../shared/constants";
import { BackgroundWebSocket, WS_OPEN } from "./background-ws-bridge";
import { SafeRTCPeerConnection } from "./safe-webrtc";
import {
  BinaryDataHandler,
  BinaryProgressHandler,
  MessageHandler,
  Transport,
} from "./transport";
import { DEFAULT_RTC_CONFIG } from "./trystero-transport";

declare const chrome: any;

export interface RelayTransportOptions {
  /** Base WebSocket URL of the WebRoom relay (e.g. wss://webroom-relay.xxx.workers.dev) */
  relayUrl?: string;
  /** Optional custom WebSocket constructor (primarily for testing) */
  webSocketFactory?: (url: string) => WebSocketLike;
  /** Keepalive ping interval in ms (default: 25000) */
  pingIntervalMs?: number;
  /** Initial reconnect delay in ms (default: 500) */
  reconnectBaseDelayMs?: number;
  /** Maximum reconnect delay in ms (default: 15000) */
  reconnectMaxDelayMs?: number;
}

export interface WebSocketLike {
  readyState: number;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

interface RelayWelcomeMessage {
  type: "welcome";
  roomId: string;
  peerId: string;
  peers: string[];
  timestamp: number;
}

interface RelayPeerLifecycleMessage {
  type: "peer_join" | "peer_leave";
  roomId: string;
  peerId: string;
  timestamp: number;
}

interface RelayForwardMessage {
  type: "relay";
  fromPeerId: string;
  payload: unknown;
}

interface RelayRtcSignalMessage {
  type: "rtc_signal";
  fromPeerId: string;
  signal: {
    kind: "offer" | "answer" | "ice";
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
}

type ServerEnvelope =
  | RelayWelcomeMessage
  | RelayPeerLifecycleMessage
  | RelayForwardMessage
  | RelayRtcSignalMessage
  | { type: "error"; code?: string; message?: string };

interface InboundFileTransferState {
  transferId: string;
  totalBytes: number;
  receivedBytes: number;
  chunks: Uint8Array[];
  metadata: Record<string, unknown>;
}

const DATA_CHANNEL_LABEL = "webroom-binary";
const CHUNK_SIZE = 16 * 1024; // 16 KB safe WebRTC DataChannel chunk
const BUFFERED_AMOUNT_HIGH = 256 * 1024;
const MAX_QUEUED_MESSAGES = 30;

/**
 * Normalizes a user-provided relay URL into a ws:// or wss:// base URL without trailing slash.
 */
export function normalizeRelayBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("https://")) {
    return "wss://" + trimmed.slice("https://".length);
  }
  if (trimmed.startsWith("http://")) {
    return "ws://" + trimmed.slice("http://".length);
  }
  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) {
    return trimmed;
  }
  return `wss://${trimmed}`;
}

/**
 * Builds the full room WebSocket URL for a given base URL, roomId, and peerId.
 */
export function buildRelayRoomUrl(
  baseUrl: string,
  roomId: string,
  peerId: string,
): string {
  const normalized = normalizeRelayBaseUrl(baseUrl);
  return `${normalized}/room/${encodeURIComponent(roomId)}?peerId=${encodeURIComponent(peerId)}`;
}

/**
 * Synchronously resolves the configured relay URL from localStorage or build-time env.
 */
export function getConfiguredRelayUrlSync(): string {
  try {
    if (typeof localStorage !== "undefined") {
      const override = localStorage.getItem(RELAY_URL_STORAGE_KEY);
      if (override && override.trim().length > 0) {
        return normalizeRelayBaseUrl(override);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return normalizeRelayBaseUrl(DEFAULT_RELAY_URL);
}

/**
 * Resolves the configured relay URL, preferring chrome.storage.local when available.
 */
export async function resolveConfiguredRelayUrl(
  explicitUrl?: string,
): Promise<string> {
  if (explicitUrl && explicitUrl.trim().length > 0) {
    return normalizeRelayBaseUrl(explicitUrl);
  }

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      const stored = await new Promise<string>((resolve) => {
        chrome.storage.local.get([RELAY_URL_STORAGE_KEY], (items: any) => {
          const val = items?.[RELAY_URL_STORAGE_KEY];
          resolve(typeof val === "string" ? val.trim() : "");
        });
      });
      if (stored) {
        return normalizeRelayBaseUrl(stored);
      }
    } catch {
      // Fall through to sync lookup
    }
  }

  return getConfiguredRelayUrlSync();
}

/**
 * Dedicated WebSocket Relay Transport backed by Cloudflare Workers + Durable Objects.
 *
 * - Routes presence, chat, follow, membership, and WebRTC signaling over a single
 *   CSP-immune BackgroundWebSocket connection per room.
 * - Handles instant peer_leave notifications and exponential-backoff auto-reconnect.
 * - Streams binary file transfers directly peer-to-peer over on-demand WebRTC DataChannels
 *   signaled through the relay (zero file bytes pass through the relay server).
 */
export class RelayWebSocketTransport implements Transport {
  public readonly roomId: string;
  public readonly peerId: string;

  private readonly explicitRelayUrl?: string;
  private readonly webSocketFactory: (url: string) => WebSocketLike;
  private readonly pingIntervalMs: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;

  private resolvedBaseUrl = "";
  private ws: WebSocketLike | null = null;
  private isStarted = false;
  private isClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private outboundQueue: string[] = [];
  private handlers = new Set<MessageHandler>();
  private binaryHandlers = new Set<BinaryDataHandler>();
  private binaryProgressHandlers = new Set<BinaryProgressHandler>();

  // On-demand P2P WebRTC DataChannels for binary file transfers
  private binaryPeers = new Map<string, RTCPeerConnection>();
  private binaryChannels = new Map<string, RTCDataChannel>();
  private pendingBinaryCandidates = new Map<string, RTCIceCandidateInit[]>();
  private inboundTransfers = new Map<string, InboundFileTransferState>();

  constructor(
    roomId: string,
    peerId: string,
    options: RelayTransportOptions = {},
  ) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.explicitRelayUrl = options.relayUrl;
    this.webSocketFactory =
      options.webSocketFactory || ((url: string) => new BackgroundWebSocket(url));
    this.pingIntervalMs = options.pingIntervalMs ?? 25000;
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 500;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 15000;
  }

  public start(): void {
    if (this.isClosed || this.isStarted) {
      return;
    }
    this.isStarted = true;

    const syncUrl = this.explicitRelayUrl
      ? normalizeRelayBaseUrl(this.explicitRelayUrl)
      : getConfiguredRelayUrlSync();

    if (syncUrl) {
      this.resolvedBaseUrl = syncUrl;
      this.connect();
      return;
    }

    // Check chrome.storage.local asynchronously if no sync URL was found
    resolveConfiguredRelayUrl(this.explicitRelayUrl)
      .then((url) => {
        if (this.isClosed || !url) {
          return;
        }
        this.resolvedBaseUrl = url;
        this.connect();
      })
      .catch((err) => {
        console.warn("[WebRoom Relay] Failed to resolve relay URL:", err);
      });
  }

  public send(message: WebRoomMessage, targetPeerId?: string): void {
    if (this.isClosed) {
      return;
    }

    if (message.roomId !== this.roomId) {
      return;
    }

    const encoded = JSON.stringify({
      type: "relay",
      ...(targetPeerId ? { targetPeerId } : {}),
      payload: message,
    });

    this.sendRaw(encoded);
  }

  public async sendBinary(
    data: ArrayBuffer | Uint8Array,
    options?: {
      target?: string;
      metadata?: Record<string, unknown>;
      onProgress?: (percent: number) => void;
    },
  ): Promise<void> {
    if (this.isClosed) {
      return;
    }

    const targetPeerId = options?.target;
    if (!targetPeerId) {
      console.warn("[WebRoom Relay] sendBinary requires a target peerId");
      return;
    }

    const bytes =
      data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
    const channel = await this.ensureBinaryDataChannel(targetPeerId);
    const transferId =
      (options?.metadata?.transferId as string) || `bin_${Date.now()}`;

    // Send transfer header
    channel.send(
      JSON.stringify({
        kind: "file_meta",
        transferId,
        totalBytes: bytes.byteLength,
        metadata: options?.metadata || {},
      }),
    );

    // Stream binary chunks with flow control
    let offset = 0;
    while (offset < bytes.byteLength) {
      if (this.isClosed || channel.readyState !== "open") {
        throw new Error("Binary DataChannel closed during transfer");
      }

      if (channel.bufferedAmount > BUFFERED_AMOUNT_HIGH) {
        await this.waitForBufferedAmountLow(channel);
      }

      const end = Math.min(offset + CHUNK_SIZE, bytes.byteLength);
      const chunk = bytes.slice(offset, end);
      channel.send(chunk);
      offset = end;

      options?.onProgress?.(
        bytes.byteLength > 0 ? Math.min(1, offset / bytes.byteLength) : 1,
      );
    }

    channel.send(
      JSON.stringify({
        kind: "file_end",
        transferId,
      }),
    );
    options?.onProgress?.(1.0);
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public onBinaryMessage(handler: BinaryDataHandler): () => void {
    this.binaryHandlers.add(handler);
    return () => {
      this.binaryHandlers.delete(handler);
    };
  }

  public onBinaryReceiveProgress(handler: BinaryProgressHandler): () => void {
    this.binaryProgressHandlers.add(handler);
    return () => {
      this.binaryProgressHandlers.delete(handler);
    };
  }

  public close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;

    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close(1000, "Client leaving room");
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    for (const peerId of Array.from(this.binaryPeers.keys())) {
      this.cleanupBinaryPeer(peerId);
    }

    this.outboundQueue = [];
    this.handlers.clear();
    this.binaryHandlers.clear();
    this.binaryProgressHandlers.clear();
  }

  private connect(): void {
    if (this.isClosed || !this.resolvedBaseUrl) {
      return;
    }

    this.clearTimers();

    const wsUrl = buildRelayRoomUrl(
      this.resolvedBaseUrl,
      this.roomId,
      this.peerId,
    );

    try {
      const ws = this.webSocketFactory(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.isClosed || this.ws !== ws) return;
        this.reconnectAttempt = 0;

        // Flush queued outbound messages
        const queued = this.outboundQueue.splice(0, this.outboundQueue.length);
        for (const msg of queued) {
          this.sendRaw(msg);
        }

        // Start lightweight ping keepalive (answered without waking Cloudflare DO)
        this.pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WS_OPEN) {
            try {
              this.ws.send("ping");
            } catch {
              // Ignore ping errors
            }
          }
        }, this.pingIntervalMs);
      };

      ws.onmessage = (event: { data: unknown }) => {
        if (this.isClosed || this.ws !== ws) return;
        this.handleSocketMessage(event.data);
      };

      ws.onerror = () => {
        // Error is followed by onclose which schedules reconnect
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
        }
        this.clearPingTimer();
        if (!this.isClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.warn("[WebRoom Relay] Failed to open WebSocket:", err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer) {
      return;
    }

    const expDelay = Math.min(
      this.reconnectMaxDelayMs,
      this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempt),
    );
    const jitter = Math.floor(Math.random() * Math.min(500, expDelay * 0.25));
    const delay = expDelay + jitter;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearPingTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendRaw(encoded: string): void {
    if (this.ws && this.ws.readyState === WS_OPEN) {
      try {
        this.ws.send(encoded);
        return;
      } catch (err) {
        console.warn("[WebRoom Relay] Send failed, queuing message:", err);
      }
    }

    this.outboundQueue.push(encoded);
    if (this.outboundQueue.length > MAX_QUEUED_MESSAGES) {
      this.outboundQueue.shift();
    }
  }

  private handleSocketMessage(raw: unknown): void {
    if (typeof raw !== "string") {
      return;
    }

    if (raw === "pong") {
      return;
    }

    let envelope: ServerEnvelope;
    try {
      envelope = JSON.parse(raw) as ServerEnvelope;
    } catch {
      return;
    }

    if (!envelope || typeof envelope !== "object") {
      return;
    }

    switch (envelope.type) {
      case "relay": {
        if (!isValidWebRoomMessage(envelope.payload, this.roomId)) {
          return;
        }
        this.dispatchMessage(envelope.payload);
        break;
      }

      case "peer_leave": {
        if (envelope.peerId && envelope.peerId !== this.peerId) {
          this.cleanupBinaryPeer(envelope.peerId);
          this.dispatchMessage({
            type: "GOODBYE",
            roomId: this.roomId,
            peerId: envelope.peerId,
            timestamp: envelope.timestamp || Date.now(),
          });
        }
        break;
      }

      case "welcome":
      case "peer_join": {
        // PresenceManager's HELLO / HEARTBEAT handles avatar & identity sync
        break;
      }

      case "rtc_signal": {
        this.handleRtcSignal(envelope.fromPeerId, envelope.signal).catch(
          (err) => {
            console.warn("[WebRoom Relay] RTC signal handling error:", err);
          },
        );
        break;
      }

      case "error": {
        console.warn(
          "[WebRoom Relay] Server error:",
          envelope.code,
          envelope.message,
        );
        break;
      }
    }
  }

  private dispatchMessage(message: WebRoomMessage): void {
    for (const handler of this.handlers) {
      try {
        handler(message);
      } catch (err) {
        console.error("[WebRoom Relay] Error in message handler:", err);
      }
    }
  }

  // --- On-demand P2P WebRTC DataChannel for binary file transfers ---

  private sendRtcSignal(
    targetPeerId: string,
    signal: RelayRtcSignalMessage["signal"],
  ): void {
    this.sendRaw(
      JSON.stringify({
        type: "rtc_signal",
        targetPeerId,
        signal,
      }),
    );
  }

  private createBinaryPeerConnection(remotePeerId: string): RTCPeerConnection {
    const pc = new SafeRTCPeerConnection(
      DEFAULT_RTC_CONFIG,
    ) as unknown as RTCPeerConnection;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendRtcSignal(remotePeerId, {
          kind: "ice",
          candidate: event.candidate.toJSON
            ? event.candidate.toJSON()
            : event.candidate,
        });
      }
    };

    pc.ondatachannel = (event) => {
      this.attachBinaryChannel(remotePeerId, event.channel);
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this.cleanupBinaryPeer(remotePeerId);
      }
    };

    this.binaryPeers.set(remotePeerId, pc);
    return pc;
  }

  private attachBinaryChannel(
    remotePeerId: string,
    channel: RTCDataChannel,
  ): void {
    channel.binaryType = "arraybuffer";
    this.binaryChannels.set(remotePeerId, channel);

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const ctrl = JSON.parse(event.data);
          if (ctrl.kind === "file_meta") {
            this.inboundTransfers.set(remotePeerId, {
              transferId: ctrl.transferId,
              totalBytes: Number(ctrl.totalBytes) || 0,
              receivedBytes: 0,
              chunks: [],
              metadata: ctrl.metadata || {},
            });
          } else if (ctrl.kind === "file_end") {
            const state = this.inboundTransfers.get(remotePeerId);
            if (!state) return;
            this.inboundTransfers.delete(remotePeerId);

            const combined = new Uint8Array(state.receivedBytes);
            let offset = 0;
            for (const chunk of state.chunks) {
              combined.set(chunk, offset);
              offset += chunk.byteLength;
            }

            for (const handler of this.binaryHandlers) {
              try {
                handler(combined.buffer, {
                  peerId: remotePeerId,
                  metadata: state.metadata,
                });
              } catch (err) {
                console.error(
                  "[WebRoom Relay] Error in binary message handler:",
                  err,
                );
              }
            }
          }
        } catch {
          // Ignore malformed control frame
        }
        return;
      }

      const state = this.inboundTransfers.get(remotePeerId);
      if (!state) return;

      const chunk =
        event.data instanceof ArrayBuffer
          ? new Uint8Array(event.data)
          : new Uint8Array(event.data.buffer || event.data);
      state.chunks.push(chunk);
      state.receivedBytes += chunk.byteLength;

      const percent =
        state.totalBytes > 0
          ? Math.min(1, state.receivedBytes / state.totalBytes)
          : 1;
      for (const handler of this.binaryProgressHandlers) {
        try {
          handler(percent, {
            peerId: remotePeerId,
            metadata: state.metadata,
          });
        } catch (err) {
          console.error(
            "[WebRoom Relay] Error in binary progress handler:",
            err,
          );
        }
      }
    };

    channel.onclose = () => {
      if (this.binaryChannels.get(remotePeerId) === channel) {
        this.binaryChannels.delete(remotePeerId);
      }
      this.inboundTransfers.delete(remotePeerId);
    };
  }

  private async ensureBinaryDataChannel(
    remotePeerId: string,
  ): Promise<RTCDataChannel> {
    const existing = this.binaryChannels.get(remotePeerId);
    if (existing && existing.readyState === "open") {
      return existing;
    }

    this.cleanupBinaryPeer(remotePeerId);
    const pc = this.createBinaryPeerConnection(remotePeerId);
    const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true,
    });
    this.attachBinaryChannel(remotePeerId, channel);

    const openPromise = new Promise<RTCDataChannel>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out establishing P2P binary DataChannel"));
      }, 15000);

      channel.onopen = () => {
        clearTimeout(timeout);
        resolve(channel);
      };
      channel.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendRtcSignal(remotePeerId, {
      kind: "offer",
      sdp: pc.localDescription?.toJSON
        ? pc.localDescription.toJSON()
        : offer,
    });

    return openPromise;
  }

  private async handleRtcSignal(
    fromPeerId: string,
    signal: RelayRtcSignalMessage["signal"],
  ): Promise<void> {
    if (!fromPeerId || fromPeerId === this.peerId) {
      return;
    }

    if (signal.kind === "offer" && signal.sdp) {
      this.cleanupBinaryPeer(fromPeerId);
      const pc = this.createBinaryPeerConnection(fromPeerId);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

      // Drain buffered ICE candidates
      const pending = this.pendingBinaryCandidates.get(fromPeerId) || [];
      this.pendingBinaryCandidates.delete(fromPeerId);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendRtcSignal(fromPeerId, {
        kind: "answer",
        sdp: pc.localDescription?.toJSON
          ? pc.localDescription.toJSON()
          : answer,
      });
      return;
    }

    if (signal.kind === "answer" && signal.sdp) {
      const pc = this.binaryPeers.get(fromPeerId);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

      const pending = this.pendingBinaryCandidates.get(fromPeerId) || [];
      this.pendingBinaryCandidates.delete(fromPeerId);
      for (const candidate of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      return;
    }

    if (signal.kind === "ice" && signal.candidate) {
      const pc = this.binaryPeers.get(fromPeerId);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        const list = this.pendingBinaryCandidates.get(fromPeerId) || [];
        list.push(signal.candidate);
        this.pendingBinaryCandidates.set(fromPeerId, list);
      }
    }
  }

  private waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const onLow = () => {
        channel.removeEventListener("bufferedamountlow", onLow);
        resolve();
      };
      channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_HIGH / 2;
      channel.addEventListener("bufferedamountlow", onLow);
      setTimeout(() => {
        channel.removeEventListener("bufferedamountlow", onLow);
        resolve();
      }, 200);
    });
  }

  private cleanupBinaryPeer(remotePeerId: string): void {
    const channel = this.binaryChannels.get(remotePeerId);
    if (channel) {
      try {
        channel.close();
      } catch {
        // Ignore
      }
      this.binaryChannels.delete(remotePeerId);
    }

    const pc = this.binaryPeers.get(remotePeerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // Ignore
      }
      this.binaryPeers.delete(remotePeerId);
    }

    this.pendingBinaryCandidates.delete(remotePeerId);
    this.inboundTransfers.delete(remotePeerId);
  }
}
