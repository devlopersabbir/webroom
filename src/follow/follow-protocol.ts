/**
 * WebRoom Follow Mode Protocol Definitions & Message Validation.
 */

export type FollowMessageType =
  | "FOLLOW_START"
  | "FOLLOW_STOP"
  | "FOLLOW_SCROLL"
  | "FOLLOW_CURSOR"
  | "FOLLOW_SELECTION"
  | "FOLLOW_NAVIGATE";

export interface FollowStartMessage {
  type: "FOLLOW_START";
  roomId: string;
  followerId: string;
  followerAvatar: string;
  leaderId: string;
  timestamp: number;
}

export interface FollowStopMessage {
  type: "FOLLOW_STOP";
  roomId: string;
  followerId: string;
  leaderId: string;
  timestamp: number;
}

export interface FollowScrollMessage {
  type: "FOLLOW_SCROLL";
  roomId: string;
  leaderId: string;
  scrollX: number;
  scrollY: number;
  maxScrollX: number;
  maxScrollY: number;
  scrollPercentageX: number;
  scrollPercentageY: number;
  timestamp: number;
}

export interface FollowCursorMessage {
  type: "FOLLOW_CURSOR";
  roomId: string;
  leaderId: string;
  leaderAvatar: string;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  percentageX: number;
  percentageY: number;
  isHovering?: boolean;
  isClicking?: boolean;
  timestamp: number;
}

export interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FollowSelectionMessage {
  type: "FOLLOW_SELECTION";
  roomId: string;
  leaderId: string;
  leaderAvatar?: string;
  selectedText: string;
  rect?: SelectionRect;
  timestamp: number;
}

export interface FollowNavigateMessage {
  type: "FOLLOW_NAVIGATE";
  roomId: string;
  leaderId: string;
  timestamp: number;
}

export type FollowMessage =
  | FollowStartMessage
  | FollowStopMessage
  | FollowScrollMessage
  | FollowCursorMessage
  | FollowSelectionMessage
  | FollowNavigateMessage;

const VALID_FOLLOW_TYPES = new Set<FollowMessageType>([
  "FOLLOW_START",
  "FOLLOW_STOP",
  "FOLLOW_SCROLL",
  "FOLLOW_CURSOR",
  "FOLLOW_SELECTION",
  "FOLLOW_NAVIGATE",
]);

/**
 * Validates whether an incoming object conforms to any FollowMessage specification.
 * If expectedRoomId is provided, also checks that the message is intended for that room.
 */
export function isValidFollowMessage(
  payload: unknown,
  expectedRoomId?: string
): payload is FollowMessage {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  if (
    typeof candidate.type !== "string" ||
    !VALID_FOLLOW_TYPES.has(candidate.type as FollowMessageType)
  ) {
    return false;
  }

  if (typeof candidate.roomId !== "string" || candidate.roomId.trim().length === 0) {
    return false;
  }

  if (expectedRoomId && candidate.roomId !== expectedRoomId) {
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
    case "FOLLOW_START":
      return (
        typeof candidate.followerId === "string" &&
        candidate.followerId.trim().length > 0 &&
        typeof candidate.followerAvatar === "string" &&
        candidate.followerAvatar.trim().length > 0 &&
        typeof candidate.leaderId === "string" &&
        candidate.leaderId.trim().length > 0
      );

    case "FOLLOW_STOP":
      return (
        typeof candidate.followerId === "string" &&
        candidate.followerId.trim().length > 0 &&
        typeof candidate.leaderId === "string" &&
        candidate.leaderId.trim().length > 0
      );

    case "FOLLOW_SCROLL":
      return (
        typeof candidate.leaderId === "string" &&
        candidate.leaderId.trim().length > 0 &&
        typeof candidate.scrollX === "number" &&
        !isNaN(candidate.scrollX) &&
        typeof candidate.scrollY === "number" &&
        !isNaN(candidate.scrollY) &&
        typeof candidate.maxScrollX === "number" &&
        !isNaN(candidate.maxScrollX) &&
        typeof candidate.maxScrollY === "number" &&
        !isNaN(candidate.maxScrollY) &&
        typeof candidate.scrollPercentageX === "number" &&
        !isNaN(candidate.scrollPercentageX) &&
        typeof candidate.scrollPercentageY === "number" &&
        !isNaN(candidate.scrollPercentageY)
      );

    case "FOLLOW_CURSOR":
      return (
        typeof candidate.leaderId === "string" &&
        candidate.leaderId.trim().length > 0 &&
        typeof candidate.leaderAvatar === "string" &&
        candidate.leaderAvatar.trim().length > 0 &&
        typeof candidate.clientX === "number" &&
        !isNaN(candidate.clientX) &&
        typeof candidate.clientY === "number" &&
        !isNaN(candidate.clientY) &&
        typeof candidate.pageX === "number" &&
        !isNaN(candidate.pageX) &&
        typeof candidate.pageY === "number" &&
        !isNaN(candidate.pageY) &&
        typeof candidate.percentageX === "number" &&
        !isNaN(candidate.percentageX) &&
        typeof candidate.percentageY === "number" &&
        !isNaN(candidate.percentageY)
      );

    case "FOLLOW_SELECTION":
      return (
        typeof candidate.leaderId === "string" &&
        candidate.leaderId.trim().length > 0 &&
        typeof candidate.selectedText === "string"
      );

    case "FOLLOW_NAVIGATE":
      return (
        typeof candidate.leaderId === "string" &&
        candidate.leaderId.trim().length > 0
      );

    default:
      return false;
  }
}

