import { Transport } from "../transport/transport";
import {
  FileAcceptMessage,
  FileCancelMessage,
  FileMetadata,
  FileOfferMessage,
  FileRejectMessage,
  FileTransferSignalingMessage,
  isValidFileTransferMessage,
} from "./file-transfer-protocol";

export type OutboundTransferStatus =
  | "AWAITING_CONSENT"
  | "TRANSFERRING"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "ERROR";

export type InboundTransferStatus =
  | "AWAITING_ACCEPTANCE"
  | "RECEIVING"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "ERROR";

export interface OutboundTransfer {
  transferId: string;
  targetPeerId: string;
  targetAvatar: string;
  file: File;
  fileMeta: FileMetadata;
  status: OutboundTransferStatus;
  progress: number; // 0.0 to 1.0
  bytesTransferred: number;
  totalBytes: number;
  speedBytesPerSec: number;
  errorMessage?: string;
}

export interface InboundTransfer {
  transferId: string;
  senderPeerId: string;
  senderAvatar: string;
  fileMeta: FileMetadata;
  status: InboundTransferStatus;
  progress: number; // 0.0 to 1.0
  bytesReceived: number;
  totalBytes: number;
  speedBytesPerSec: number;
  errorMessage?: string;
  receivedBlob?: Blob;
}

export type OutboundStateListener = (transfer: OutboundTransfer | null) => void;
export type InboundStateListener = (transfer: InboundTransfer | null) => void;

/**
 * Anti-spam rate limiting configuration:
 * If a target peer declines 3 times within 1 minute, sending to that peer is
 * blocked for a minimum of 5 minutes.
 */
export const REJECTION_WINDOW_MS = 60 * 1000; // 1 minute
export const REJECTION_THRESHOLD = 3; // 3 rejections
export const COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Triggers native browser download for a received Blob.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
        URL.revokeObjectURL(url);
      } catch {
        // Cleanup fallback
      }
    }, 1500);
  } catch (err) {
    console.error("[WebRoom FileTransfer] Failed to trigger download:", err);
  }
}

/**
 * Peer-to-Peer Direct File Transfer Manager
 * Coordinates file offer/consent signaling and WebRTC DataChannel binary streaming.
 * Zero middleman, zero cloud storage, end-to-end encrypted.
 */
export class FileTransferManager {
  private readonly roomId: string;
  private readonly peerId: string;
  private readonly avatar: string;
  private readonly transport: Transport;

  private currentOutbound: OutboundTransfer | null = null;
  private currentInbound: InboundTransfer | null = null;

  private outboundListeners = new Set<OutboundStateListener>();
  private inboundListeners = new Set<InboundStateListener>();

  // Anti-spam rejection rate limit state per targetPeerId
  private rejectionRecords = new Map<
    string,
    { timestamps: number[]; cooldownUntil: number }
  >();

  private unsubscribeTransportMsg: (() => void) | null = null;
  private unsubscribeBinaryMsg: (() => void) | null = null;
  private unsubscribeBinaryProgress: (() => void) | null = null;

  private lastProgressTime = 0;
  private lastTransferredBytes = 0;
  private isDestroyed = false;

  constructor(
    roomId: string,
    peerId: string,
    avatar: string,
    transport: Transport,
  ) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.avatar = avatar;
    this.transport = transport;
  }

  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    // Subscribe to signaling messages
    this.unsubscribeTransportMsg = this.transport.onMessage((msg) => {
      if (isValidFileTransferMessage(msg, this.roomId)) {
        this.handleSignalingMessage(msg);
      }
    });

    // Subscribe to direct binary file packets
    if (this.transport.onBinaryMessage) {
      this.unsubscribeBinaryMsg = this.transport.onBinaryMessage(
        (data, context) => {
          this.handleBinaryMessage(data, context);
        },
      );
    }

    // Subscribe to incoming binary stream progress
    if (this.transport.onBinaryReceiveProgress) {
      this.unsubscribeBinaryProgress =
        this.transport.onBinaryReceiveProgress((percent, context) => {
          this.handleBinaryReceiveProgress(percent, context);
        });
    }
  }

  public getOutboundTransfer(): OutboundTransfer | null {
    return this.currentOutbound;
  }

  public getInboundTransfer(): InboundTransfer | null {
    return this.currentInbound;
  }

  public onOutboundChange(listener: OutboundStateListener): () => void {
    this.outboundListeners.add(listener);
    listener(this.currentOutbound);
    return () => {
      this.outboundListeners.delete(listener);
    };
  }

  public onInboundChange(listener: InboundStateListener): () => void {
    this.inboundListeners.add(listener);
    listener(this.currentInbound);
    return () => {
      this.inboundListeners.delete(listener);
    };
  }

  /**
   * Returns remaining cooldown in milliseconds for sending files to a target peer.
   * Returns 0 if not currently rate-limited.
   */
  public getRejectionCooldownMs(targetPeerId: string): number {
    const record = this.rejectionRecords.get(targetPeerId);
    if (!record || record.cooldownUntil <= 0) {
      return 0;
    }
    const remaining = record.cooldownUntil - Date.now();
    if (remaining <= 0) {
      record.cooldownUntil = 0;
      return 0;
    }
    return remaining;
  }

  /**
   * Returns number of rejections received from target peer within the trailing 1-minute window.
   */
  public getRecentRejectionCount(targetPeerId: string): number {
    const record = this.rejectionRecords.get(targetPeerId);
    if (!record) {
      return 0;
    }
    const now = Date.now();
    record.timestamps = record.timestamps.filter(
      (t) => now - t <= REJECTION_WINDOW_MS,
    );
    return record.timestamps.length;
  }

  /**
   * Initiates a 1-to-1 direct file transfer to a targeted participant.
   * Prompts recipient with consent dialog before streaming bytes.
   */
  public async requestSendFile(
    targetPeerId: string,
    targetAvatar: string,
    file: File,
  ): Promise<string> {
    if (this.isDestroyed) {
      throw new Error("FileTransferManager is destroyed");
    }

    if (targetPeerId === this.peerId) {
      throw new Error("Cannot send file to oneself");
    }

    const cooldownRemaining = this.getRejectionCooldownMs(targetPeerId);
    if (cooldownRemaining > 0) {
      const totalSec = Math.ceil(cooldownRemaining / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const formatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
      throw new Error(
        `Sending blocked: Participant ${targetAvatar} declined 3 requests within 1 minute. Try again in ${formatted}.`,
      );
    }

    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 12);
    const transferId = `ft_${uuid.replace(/-/g, "").slice(0, 10)}`;

    const fileMeta: FileMetadata = {
      id: `file_${uuid.slice(0, 8)}`,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified,
    };

    this.currentOutbound = {
      transferId,
      targetPeerId,
      targetAvatar,
      file,
      fileMeta,
      status: "AWAITING_CONSENT",
      progress: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      speedBytesPerSec: 0,
    };
    this.notifyOutboundListeners();

    const offer: FileOfferMessage = {
      type: "FILE_OFFER",
      transferId,
      roomId: this.roomId,
      peerId: this.peerId,
      senderPeerId: this.peerId,
      senderAvatar: this.avatar,
      targetPeerId,
      fileMeta,
      timestamp: Date.now(),
    };

    console.log(
      `[WebRoom FileTransfer] 📤 Offering file "${file.name}" to ${targetAvatar} (${targetPeerId})`,
    );
    this.transport.send(offer, targetPeerId);

    return transferId;
  }

  /**
   * Recipient accepts the offered file.
   * Transmits FILE_ACCEPT to sender to trigger streaming.
   */
  public acceptTransfer(transferId: string): void {
    if (
      !this.currentInbound ||
      this.currentInbound.transferId !== transferId ||
      this.currentInbound.status !== "AWAITING_ACCEPTANCE"
    ) {
      return;
    }

    this.currentInbound.status = "RECEIVING";
    this.currentInbound.progress = 0;
    this.lastProgressTime = Date.now();
    this.lastTransferredBytes = 0;
    this.notifyInboundListeners();

    const accept: FileAcceptMessage = {
      type: "FILE_ACCEPT",
      transferId,
      roomId: this.roomId,
      peerId: this.peerId,
      receiverPeerId: this.peerId,
      targetPeerId: this.currentInbound.senderPeerId,
      timestamp: Date.now(),
    };

    console.log(
      `[WebRoom FileTransfer] ✅ Accepted file offer ${transferId} from ${this.currentInbound.senderPeerId}`,
    );
    this.transport.send(accept, this.currentInbound.senderPeerId);
  }

  /**
   * Recipient rejects the offered file.
   */
  public rejectTransfer(
    transferId: string,
    reason = "Recipient declined transfer",
  ): void {
    if (
      !this.currentInbound ||
      this.currentInbound.transferId !== transferId
    ) {
      return;
    }

    const senderPeerId = this.currentInbound.senderPeerId;
    this.currentInbound.status = "REJECTED";
    this.currentInbound.errorMessage = reason;
    this.notifyInboundListeners();

    const reject: FileRejectMessage = {
      type: "FILE_REJECT",
      transferId,
      roomId: this.roomId,
      peerId: this.peerId,
      receiverPeerId: this.peerId,
      targetPeerId: senderPeerId,
      reason,
      timestamp: Date.now(),
    };

    console.log(
      `[WebRoom FileTransfer] ❌ Rejected file offer ${transferId} from ${senderPeerId}`,
    );
    this.transport.send(reject, senderPeerId);
  }

  /**
   * Cancels an active or pending transfer.
   */
  public cancelTransfer(
    transferId: string,
    reason = "Transfer cancelled",
  ): void {
    // Check if outbound
    if (this.currentOutbound && this.currentOutbound.transferId === transferId) {
      const targetPeerId = this.currentOutbound.targetPeerId;
      this.currentOutbound.status = "CANCELLED";
      this.currentOutbound.errorMessage = reason;
      this.notifyOutboundListeners();

      const cancel: FileCancelMessage = {
        type: "FILE_CANCEL",
        transferId,
        roomId: this.roomId,
        peerId: this.peerId,
        senderPeerId: this.peerId,
        targetPeerId,
        reason,
        timestamp: Date.now(),
      };
      this.transport.send(cancel, targetPeerId);
      return;
    }

    // Check if inbound
    if (this.currentInbound && this.currentInbound.transferId === transferId) {
      const targetPeerId = this.currentInbound.senderPeerId;
      this.currentInbound.status = "CANCELLED";
      this.currentInbound.errorMessage = reason;
      this.notifyInboundListeners();

      const cancel: FileCancelMessage = {
        type: "FILE_CANCEL",
        transferId,
        roomId: this.roomId,
        peerId: this.peerId,
        senderPeerId: this.peerId,
        targetPeerId,
        reason,
        timestamp: Date.now(),
      };
      this.transport.send(cancel, targetPeerId);
    }
  }

  /**
   * Cleans up transfers if the associated peer disconnects.
   */
  public handlePeerLeft(remotePeerId: string): void {
    if (this.currentOutbound?.targetPeerId === remotePeerId) {
      this.currentOutbound.status = "CANCELLED";
      this.currentOutbound.errorMessage = "Target participant disconnected";
      this.notifyOutboundListeners();
    }
    if (this.currentInbound?.senderPeerId === remotePeerId) {
      this.currentInbound.status = "CANCELLED";
      this.currentInbound.errorMessage = "Sender disconnected";
      this.notifyInboundListeners();
    }
  }

  public clearOutbound(): void {
    this.currentOutbound = null;
    this.notifyOutboundListeners();
  }

  public clearInbound(): void {
    this.currentInbound = null;
    this.notifyInboundListeners();
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    if (this.unsubscribeTransportMsg) {
      this.unsubscribeTransportMsg();
      this.unsubscribeTransportMsg = null;
    }
    if (this.unsubscribeBinaryMsg) {
      this.unsubscribeBinaryMsg();
      this.unsubscribeBinaryMsg = null;
    }
    if (this.unsubscribeBinaryProgress) {
      this.unsubscribeBinaryProgress();
      this.unsubscribeBinaryProgress = null;
    }

    this.currentOutbound = null;
    this.currentInbound = null;
    this.outboundListeners.clear();
    this.inboundListeners.clear();
    this.rejectionRecords.clear();
  }

  private handleSignalingMessage(msg: FileTransferSignalingMessage): void {
    // Strictly ignore signaling not addressed to us
    if (msg.targetPeerId !== this.peerId) {
      return;
    }

    switch (msg.type) {
      case "FILE_OFFER":
        this.handleIncomingOffer(msg);
        break;

      case "FILE_ACCEPT":
        this.handleIncomingAccept(msg);
        break;

      case "FILE_REJECT":
        this.handleIncomingReject(msg);
        break;

      case "FILE_CANCEL":
        this.handleIncomingCancel(msg);
        break;
    }
  }

  private handleIncomingOffer(msg: FileOfferMessage): void {
    // If already receiving or reviewing another transfer, reject with busy status
    if (
      this.currentInbound &&
      (this.currentInbound.status === "AWAITING_ACCEPTANCE" ||
        this.currentInbound.status === "RECEIVING")
    ) {
      const reject: FileRejectMessage = {
        type: "FILE_REJECT",
        transferId: msg.transferId,
        roomId: this.roomId,
        peerId: this.peerId,
        receiverPeerId: this.peerId,
        targetPeerId: msg.senderPeerId,
        reason: "Recipient is currently in another transfer",
        timestamp: Date.now(),
      };
      this.transport.send(reject, msg.senderPeerId);
      return;
    }

    this.currentInbound = {
      transferId: msg.transferId,
      senderPeerId: msg.senderPeerId,
      senderAvatar: msg.senderAvatar,
      fileMeta: msg.fileMeta,
      status: "AWAITING_ACCEPTANCE",
      progress: 0,
      bytesReceived: 0,
      totalBytes: msg.fileMeta.size,
      speedBytesPerSec: 0,
    };
    this.notifyInboundListeners();
  }

  private async handleIncomingAccept(msg: FileAcceptMessage): Promise<void> {
    if (
      !this.currentOutbound ||
      this.currentOutbound.transferId !== msg.transferId
    ) {
      return;
    }

    if (this.currentOutbound.status !== "AWAITING_CONSENT") {
      return;
    }

    this.currentOutbound.status = "TRANSFERRING";
    this.currentOutbound.progress = 0;
    this.lastProgressTime = Date.now();
    this.lastTransferredBytes = 0;
    this.notifyOutboundListeners();

    try {
      const file = this.currentOutbound.file;
      const arrayBuffer = await file.arrayBuffer();

      if (
        !this.currentOutbound ||
        this.currentOutbound.transferId !== msg.transferId ||
        this.currentOutbound.status !== "TRANSFERRING"
      ) {
        return;
      }

      console.log(
        `[WebRoom FileTransfer] 🚀 Streaming "${file.name}" (${file.size} bytes) directly to ${this.currentOutbound.targetPeerId}`,
      );

      if (this.transport.sendBinary) {
        await this.transport.sendBinary(arrayBuffer, {
          target: this.currentOutbound.targetPeerId,
          metadata: {
            transferId: this.currentOutbound.transferId,
            senderPeerId: this.peerId,
            targetPeerId: this.currentOutbound.targetPeerId,
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
          },
          onProgress: (percent) => {
            if (this.currentOutbound?.status === "TRANSFERRING") {
              const now = Date.now();
              const transferred = Math.round(percent * file.size);
              const elapsedSec = (now - this.lastProgressTime) / 1000;

              let speed = this.currentOutbound.speedBytesPerSec;
              if (elapsedSec >= 0.3) {
                speed = Math.round((transferred - this.lastTransferredBytes) / elapsedSec);
                this.lastProgressTime = now;
                this.lastTransferredBytes = transferred;
              }

              this.currentOutbound.progress = percent;
              this.currentOutbound.bytesTransferred = transferred;
              this.currentOutbound.speedBytesPerSec = Math.max(0, speed);
              this.notifyOutboundListeners();
            }
          },
        });
      }

      if (this.currentOutbound && this.currentOutbound.status === "TRANSFERRING") {
        this.currentOutbound.status = "COMPLETED";
        this.currentOutbound.progress = 1.0;
        this.currentOutbound.bytesTransferred = file.size;
        this.notifyOutboundListeners();
        console.log(
          `[WebRoom FileTransfer] 🎉 File transfer completed for "${file.name}"`,
        );
      }
    } catch (err) {
      console.error("[WebRoom FileTransfer] Error during file stream:", err);
      if (this.currentOutbound && this.currentOutbound.status === "TRANSFERRING") {
        this.currentOutbound.status = "ERROR";
        this.currentOutbound.errorMessage = "Failed to stream file data";
        this.notifyOutboundListeners();
      }
    }
  }

  private handleIncomingReject(msg: FileRejectMessage): void {
    if (
      !this.currentOutbound ||
      this.currentOutbound.transferId !== msg.transferId
    ) {
      return;
    }

    const targetPeerId = this.currentOutbound.targetPeerId;
    const now = Date.now();
    let record = this.rejectionRecords.get(targetPeerId);
    if (!record) {
      record = { timestamps: [], cooldownUntil: 0 };
      this.rejectionRecords.set(targetPeerId, record);
    }

    // Filter to trailing 1 minute
    record.timestamps = record.timestamps.filter(
      (t) => now - t <= REJECTION_WINDOW_MS,
    );
    record.timestamps.push(now);

    let cooldownTriggered = false;
    if (record.timestamps.length >= REJECTION_THRESHOLD) {
      record.cooldownUntil = now + COOLDOWN_DURATION_MS;
      record.timestamps = [];
      cooldownTriggered = true;
      console.warn(
        `[WebRoom FileTransfer] ⏱️ 3 rejections within 1 minute from ${targetPeerId}. Rate limiting sender for 5 minutes.`,
      );
    }

    this.currentOutbound.status = "REJECTED";
    if (cooldownTriggered) {
      this.currentOutbound.errorMessage = `Participant ${this.currentOutbound.targetAvatar} declined 3 requests within 1 minute. Sending is blocked for 5 minutes.`;
    } else {
      this.currentOutbound.errorMessage =
        msg.reason || `Participant ${this.currentOutbound.targetAvatar} declined the transfer request`;
    }
    this.notifyOutboundListeners();
  }

  private handleIncomingCancel(msg: FileCancelMessage): void {
    if (
      this.currentOutbound &&
      this.currentOutbound.transferId === msg.transferId
    ) {
      this.currentOutbound.status = "CANCELLED";
      this.currentOutbound.errorMessage =
        msg.reason || `Participant ${this.currentOutbound.targetAvatar} cancelled the transfer`;
      this.notifyOutboundListeners();
    }

    if (
      this.currentInbound &&
      this.currentInbound.transferId === msg.transferId
    ) {
      this.currentInbound.status = "CANCELLED";
      this.currentInbound.errorMessage =
        msg.reason || `Participant ${this.currentInbound.senderAvatar} cancelled the transfer request`;
      this.notifyInboundListeners();
    }
  }

  private handleBinaryReceiveProgress(
    percent: number,
    context: { peerId: string; metadata?: Record<string, unknown> },
  ): void {
    if (
      !this.currentInbound ||
      this.currentInbound.status !== "RECEIVING"
    ) {
      return;
    }

    const meta = context.metadata;
    if (meta?.transferId && meta.transferId !== this.currentInbound.transferId) {
      return;
    }

    if (
      meta?.targetPeerId &&
      typeof meta.targetPeerId === "string" &&
      meta.targetPeerId !== this.peerId
    ) {
      return;
    }

    const total = this.currentInbound.totalBytes;
    const received = Math.round(percent * total);
    const now = Date.now();
    const elapsedSec = (now - this.lastProgressTime) / 1000;

    let speed = this.currentInbound.speedBytesPerSec;
    if (elapsedSec >= 0.3) {
      speed = Math.round((received - this.lastTransferredBytes) / elapsedSec);
      this.lastProgressTime = now;
      this.lastTransferredBytes = received;
    }

    this.currentInbound.progress = percent;
    this.currentInbound.bytesReceived = received;
    this.currentInbound.speedBytesPerSec = Math.max(0, speed);
    this.notifyInboundListeners();
  }

  private handleBinaryMessage(
    data: ArrayBuffer,
    context: { peerId: string; metadata?: Record<string, unknown> },
  ): void {
    if (!this.currentInbound) {
      return;
    }

    const meta = context.metadata;
    if (meta?.transferId && meta.transferId !== this.currentInbound.transferId) {
      return;
    }

    if (
      meta?.targetPeerId &&
      typeof meta.targetPeerId === "string" &&
      meta.targetPeerId !== this.peerId
    ) {
      return;
    }

    console.log(
      `[WebRoom FileTransfer] 📥 Received complete binary payload for "${this.currentInbound.fileMeta.name}" (${data.byteLength} bytes)`,
    );

    const blob = new Blob([data], {
      type: this.currentInbound.fileMeta.type || "application/octet-stream",
    });

    this.currentInbound.status = "COMPLETED";
    this.currentInbound.progress = 1.0;
    this.currentInbound.bytesReceived = data.byteLength;
    this.currentInbound.receivedBlob = blob;
    this.notifyInboundListeners();

    // Trigger automatic file download in browser
    triggerBrowserDownload(blob, this.currentInbound.fileMeta.name);
  }

  private notifyOutboundListeners(): void {
    for (const listener of this.outboundListeners) {
      try {
        listener(this.currentOutbound);
      } catch (err) {
        console.error("[WebRoom FileTransfer] Error in outbound listener:", err);
      }
    }
  }

  private notifyInboundListeners(): void {
    for (const listener of this.inboundListeners) {
      try {
        listener(this.currentInbound);
      } catch (err) {
        console.error("[WebRoom FileTransfer] Error in inbound listener:", err);
      }
    }
  }
}
