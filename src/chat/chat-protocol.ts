import { MAX_MESSAGE_LENGTH } from "../shared/constants";

/**
 * WebRoom Chat Protocol Definitions & Message Validation.
 */

export interface ChatMessage {
  type: "CHAT_MESSAGE";
  id: string;
  roomId: string;
  peerId: string;
  avatar: string;
  text: string;
  timestamp: number;
}

/**
 * Validates whether an incoming object conforms to the ChatMessage specification.
 * If expectedRoomId is provided, also checks that the message is intended for that room.
 */
export function isValidChatMessage(
  payload: unknown,
  expectedRoomId?: string
): payload is ChatMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  if (candidate.type !== "CHAT_MESSAGE") {
    return false;
  }

  if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
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

  if (typeof candidate.avatar !== "string" || candidate.avatar.trim().length === 0) {
    return false;
  }

  if (
    typeof candidate.text !== "string" ||
    candidate.text.length === 0 ||
    candidate.text.length > MAX_MESSAGE_LENGTH
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

  return true;
}
