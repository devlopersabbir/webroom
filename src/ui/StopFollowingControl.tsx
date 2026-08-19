import React from "react";
import { FollowPeerInfo } from "../follow/follow-store";
import { Room } from "../room/room";

interface StopFollowingControlProps {
  room: Room;
  followingLeader: FollowPeerInfo | null;
}

/**
 * Floating action control positioned near the bottom center of the viewport
 * allowing the user to immediately exit Follow Mode.
 */
export const StopFollowingControl: React.FC<StopFollowingControlProps> = ({
  room,
  followingLeader,
}) => {
  if (!followingLeader) {
    return null;
  }

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    room.unfollowUser();
  };

  return (
    <div
      className="webroom-bottom-stop-wrapper"
      role="region"
      aria-label="WebRoom Follow Controls"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="webroom-bottom-stop-pill">
        <div className="webroom-bottom-stop-pulse" />
        <span className="webroom-bottom-stop-label">
          Following <span className="webroom-bottom-stop-avatar">{followingLeader.avatar}</span>
        </span>
        <button
          type="button"
          className="webroom-bottom-stop-btn"
          onClick={handleStop}
          aria-label={`Stop following ${followingLeader.avatar}`}
        >
          Stop Following
        </button>
      </div>
    </div>
  );
};
