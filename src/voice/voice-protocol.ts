/**
 * WebRoom Voice Protocol Definitions & WebRTC Signaling Message Validation
 */

export type VoiceMessageType =
  | "VOICE_OFFER"
  | "VOICE_ANSWER"
  | "VOICE_ICE_CANDIDATE"
  | "VOICE_STATE";

export interface VoiceOfferMessage {
  type: "VOICE_OFFER";
  roomId: string;
  peerId: string;
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
  timestamp: number;
}

export interface VoiceAnswerMessage {
  type: "VOICE_ANSWER";
  roomId: string;
  peerId: string;
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
  timestamp: number;
}

export interface VoiceIceCandidateMessage {
  type: "VOICE_ICE_CANDIDATE";
  roomId: string;
  peerId: string;
  targetPeerId: string;
  candidate: RTCIceCandidateInit;
  timestamp: number;
}

export interface VoiceStateMessage {
  type: "VOICE_STATE";
  roomId: string;
  peerId: string;
  isMicOn: boolean;
  timestamp: number;
}

export type VoiceSignalingMessage =
  | VoiceOfferMessage
  | VoiceAnswerMessage
  | VoiceIceCandidateMessage
  | VoiceStateMessage;

const VALID_VOICE_MESSAGE_TYPES = new Set<VoiceMessageType>([
  "VOICE_OFFER",
  "VOICE_ANSWER",
  "VOICE_ICE_CANDIDATE",
  "VOICE_STATE",
]);

/**
 * Validates whether an incoming object conforms to the VoiceSignalingMessage specification.
 */
export function isValidVoiceSignalingMessage(
  payload: unknown,
  expectedRoomId?: string
): payload is VoiceSignalingMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  if (
    typeof candidate.type !== "string" ||
    !VALID_VOICE_MESSAGE_TYPES.has(candidate.type as VoiceMessageType)
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
    typeof candidate.peerId !== "string" ||
    candidate.peerId.trim().length === 0
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

  const msgType = candidate.type as VoiceMessageType;

  if (msgType === "VOICE_OFFER" || msgType === "VOICE_ANSWER") {
    if (
      typeof candidate.targetPeerId !== "string" ||
      candidate.targetPeerId.trim().length === 0
    ) {
      return false;
    }
    if (!candidate.sdp || typeof candidate.sdp !== "object") {
      return false;
    }
    const sdpObj = candidate.sdp as Record<string, unknown>;
    if (
      typeof sdpObj.type !== "string" ||
      typeof sdpObj.sdp !== "string" ||
      sdpObj.sdp.length > 65536
    ) {
      return false;
    }
  }

  if (msgType === "VOICE_ICE_CANDIDATE") {
    if (
      typeof candidate.targetPeerId !== "string" ||
      candidate.targetPeerId.trim().length === 0
    ) {
      return false;
    }
    if (!candidate.candidate || typeof candidate.candidate !== "object") {
      return false;
    }
  }

  if (msgType === "VOICE_STATE") {
    if (typeof candidate.isMicOn !== "boolean") {
      return false;
    }
  }

  return true;
}
