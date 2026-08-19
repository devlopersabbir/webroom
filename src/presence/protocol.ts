import { ChatMessage, isValidChatMessage } from "../chat/chat-protocol";
import { FollowMessage, isValidFollowMessage } from "../follow/follow-protocol";
import { isValidVoiceSignalingMessage, VoiceSignalingMessage } from "../voice/voice-protocol";

/**
 * WebRoom Presence Protocol Definitions & Message Validation
 */

export type PresenceMessageType = "HELLO" | "HEARTBEAT" | "GOODBYE";

export interface PresenceMessage {
  type: PresenceMessageType;
  roomId: string;
  peerId: string;
  avatar?: string;
  timestamp: number;
}

/**
 * Unified message type for the WebRoom peer-to-peer transport layer.
 */
export type WebRoomMessage =
  | PresenceMessage
  | ChatMessage
  | VoiceSignalingMessage
  | FollowMessage;

const VALID_MESSAGE_TYPES = new Set<PresenceMessageType>(["HELLO", "HEARTBEAT", "GOODBYE"]);

/**
 * Validates whether an incoming object conforms to the PresenceMessage specification.
 * If expectedRoomId is provided, also checks that the message is intended for that room.
 */
export function isValidPresenceMessage(
  payload: unknown,
  expectedRoomId?: string
): payload is PresenceMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.type !== "string" || !VALID_MESSAGE_TYPES.has(candidate.type as PresenceMessageType)) {
    return false;
  }

  if (typeof candidate.roomId !== "string" || candidate.roomId.trim().length === 0) {
    return false;
  }

  if (expectedRoomId && candidate.roomId !== expectedRoomId) {
    return false;
  }

  if (typeof candidate.peerId !== "string" || candidate.peerId.trim().length === 0) {
    return false;
  }

  if (
    candidate.avatar !== undefined &&
    (typeof candidate.avatar !== "string" || candidate.avatar.trim().length === 0)
  ) {
    return false;
  }

  if (typeof candidate.timestamp !== "number" || isNaN(candidate.timestamp) || candidate.timestamp <= 0) {
    return false;
  }

  return true;
}

/**
 * Validates whether an incoming object conforms to any WebRoomMessage specification.
 */
export function isValidWebRoomMessage(
  payload: unknown,
  expectedRoomId?: string
): payload is WebRoomMessage {
  return (
    isValidPresenceMessage(payload, expectedRoomId) ||
    isValidChatMessage(payload, expectedRoomId) ||
    isValidVoiceSignalingMessage(payload, expectedRoomId) ||
    isValidFollowMessage(payload, expectedRoomId)
  );
}


