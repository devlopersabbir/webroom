import React from "react";
import { FollowPeerInfo } from "../follow/follow-store";
import { Room } from "../room/room";

interface FollowingIndicatorProps {
  room: Room;
  followingLeader: FollowPeerInfo | null;
}

/**
 * Sleek floating indicator near the top of the viewport
 * showing who is currently being followed.
 */
export const FollowingIndicator: React.FC<FollowingIndicatorProps> = ({
  room,
  followingLeader,
}) => {
  if (!followingLeader) {
    return null;
  }

  const handleStopFollowing = (e: React.MouseEvent) => {
    e.stopPropagation();
    room.unfollowUser();
  };

  return (
    <div
      className="webroom-top-following-indicator"
      role="status"
      aria-live="polite"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="webroom-top-following-pill">
        <span className="webroom-top-following-icon">👁</span>
        <span className="webroom-top-following-text">
          Following <span className="webroom-top-following-avatar">{followingLeader.avatar}</span>
        </span>
        <button
          type="button"
          className="webroom-top-following-stop-btn"
          onClick={handleStopFollowing}
          title={`Stop following ${followingLeader.avatar}`}
          aria-label={`Stop following ${followingLeader.avatar}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
};
