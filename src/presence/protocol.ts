/**
 * WebRoom Presence Protocol Definitions & Message Validation
 */

export type PresenceMessageType = "HELLO" | "HEARTBEAT" | "GOODBYE";

export interface PresenceMessage {
  type: PresenceMessageType;
  roomId: string;
  peerId: string;
  timestamp: number;
}

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

  if (typeof candidate.timestamp !== "number" || isNaN(candidate.timestamp) || candidate.timestamp <= 0) {
    return false;
  }

  return true;
}
