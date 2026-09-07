/**
 * WebRoom P2P File Transfer Protocol Definitions & Signaling Message Validation
 *
 * Implements 1-to-1 direct peer-to-peer file transfer signaling over WebRTC.
 * No central server, zero intermediate storage, end-to-end encrypted.
 */

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified?: number;
}

export type FileTransferMessageType =
  | "FILE_OFFER"
  | "FILE_ACCEPT"
  | "FILE_REJECT"
  | "FILE_CANCEL";

export interface FileOfferMessage {
  type: "FILE_OFFER";
  transferId: string;
  roomId: string;
  senderPeerId: string;
  senderAvatar: string;
  targetPeerId: string;
  fileMeta: FileMetadata;
  timestamp: number;
}

export interface FileAcceptMessage {
  type: "FILE_ACCEPT";
  transferId: string;
  roomId: string;
  receiverPeerId: string;
  targetPeerId: string;
  timestamp: number;
}

export interface FileRejectMessage {
  type: "FILE_REJECT";
  transferId: string;
  roomId: string;
  receiverPeerId: string;
  targetPeerId: string;
  reason?: string;
  timestamp: number;
}

export interface FileCancelMessage {
  type: "FILE_CANCEL";
  transferId: string;
  roomId: string;
  peerId: string;
  targetPeerId: string;
  reason?: string;
  timestamp: number;
}

export type FileTransferSignalingMessage =
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileCancelMessage;

const VALID_FILE_TRANSFER_TYPES = new Set<FileTransferMessageType>([
  "FILE_OFFER",
  "FILE_ACCEPT",
  "FILE_REJECT",
  "FILE_CANCEL",
]);

/**
 * Validates whether an incoming object conforms to the FileMetadata specification.
 */
export function isValidFileMetadata(payload: unknown): payload is FileMetadata {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const meta = payload as Record<string, unknown>;
  return (
    typeof meta.id === "string" &&
    meta.id.trim().length > 0 &&
    typeof meta.name === "string" &&
    meta.name.trim().length > 0 &&
    typeof meta.size === "number" &&
    !isNaN(meta.size) &&
    meta.size >= 0 &&
    typeof meta.type === "string"
  );
}

/**
 * Validates whether an incoming object conforms to the FileTransferSignalingMessage specification.
 */
export function isValidFileTransferMessage(
  payload: unknown,
  expectedRoomId?: string,
): payload is FileTransferSignalingMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  if (
    typeof candidate.type !== "string" ||
    !VALID_FILE_TRANSFER_TYPES.has(candidate.type as FileTransferMessageType)
  ) {
    return false;
  }

  if (
    typeof candidate.transferId !== "string" ||
    candidate.transferId.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof candidate.roomId !== "string" ||
    candidate.roomId.trim().length === 0
  ) {
    return false;
  }

  if (expectedRoomId && candidate.roomId !== expectedRoomId) {
    return false;
  }

  if (
    typeof candidate.targetPeerId !== "string" ||
    candidate.targetPeerId.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof candidate.timestamp !== "number" ||
    isNaN(candidate.timestamp) ||
    candidate.timestamp <= 0
  ) {
    return false;
  }

  switch (candidate.type) {
    case "FILE_OFFER":
      return (
        typeof candidate.senderPeerId === "string" &&
        candidate.senderPeerId.trim().length > 0 &&
        typeof candidate.senderAvatar === "string" &&
        candidate.senderAvatar.trim().length > 0 &&
        isValidFileMetadata(candidate.fileMeta)
      );

    case "FILE_ACCEPT":
      return (
        typeof candidate.receiverPeerId === "string" &&
        candidate.receiverPeerId.trim().length > 0
      );

    case "FILE_REJECT":
      return (
        typeof candidate.receiverPeerId === "string" &&
        candidate.receiverPeerId.trim().length > 0 &&
        (candidate.reason === undefined || typeof candidate.reason === "string")
      );

    case "FILE_CANCEL":
      return (
        typeof candidate.peerId === "string" &&
        candidate.peerId.trim().length > 0 &&
        (candidate.reason === undefined || typeof candidate.reason === "string")
      );

    default:
      return false;
  }
}

/**
 * Formats byte size into human-readable representation (e.g. 1.2 MB, 450 KB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
