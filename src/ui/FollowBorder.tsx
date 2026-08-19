import React from "react";
import { FollowPeerInfo } from "../follow/follow-store";

interface FollowBorderProps {
  followingLeader: FollowPeerInfo | null;
}

/**
 * Full-screen Figma-inspired animated border around the viewport
 * displayed when Follow Mode is actively following a leader.
 */
export const FollowBorder: React.FC<FollowBorderProps> = ({ followingLeader }) => {
  if (!followingLeader) {
    return null;
  }

  return (
    <div
      className="webroom-follow-border-overlay"
      aria-hidden="true"
    >
      <div className="webroom-follow-border-inner" />
    </div>
  );
};
