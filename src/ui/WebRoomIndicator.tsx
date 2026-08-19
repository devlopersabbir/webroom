import React, { useEffect, useState } from "react";
import { FollowPeerInfo } from "../follow/follow-store";
import { Room } from "../room/room";
import { FollowBorder } from "./FollowBorder";
import { FollowCursor } from "./FollowCursor";
import { FollowingIndicator } from "./FollowingIndicator";
import { StopFollowingControl } from "./StopFollowingControl";
import { WebRoomPanel } from "./WebRoomPanel";

interface WebRoomIndicatorProps {
  room: Room;
}

export const WebRoomIndicator: React.FC<WebRoomIndicatorProps> = ({ room }) => {
  const [count, setCount] = useState<number>(room.getOnlineCount());
  const [bumping, setBumping] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [followingLeader, setFollowingLeader] = useState<FollowPeerInfo | null>(room.getFollowing());

  useEffect(() => {
    const unsubscribe = room.onCountChange((newCount) => {
      setCount((prev) => {
        if (prev !== newCount) {
          setBumping(true);
          setTimeout(() => setBumping(false), 250);
        }
        return newCount;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [room]);

  useEffect(() => {
    const unsubscribe = room.onFollowChange((following) => {
      setFollowingLeader(following);
    });

    return () => {
      unsubscribe();
    };
  }, [room]);

  // Handle ESC key to close the panel cleanly without triggering host page shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      {/* Live Remote Leader Mouse Cursor */}
      <FollowCursor room={room} />

      {/* Full-screen Figma-inspired Follow Border */}
      <FollowBorder followingLeader={followingLeader} />

      {/* Top Floating Following Indicator */}
      <FollowingIndicator room={room} followingLeader={followingLeader} />

      {/* Bottom Floating Stop Following Action Control */}
      <StopFollowingControl room={room} followingLeader={followingLeader} />

      {/* Bottom-Right WebRoom Panel & Indicator Pill */}
      <div className="webroom-floating-wrapper" id="webroom-indicator">
        {/* Floating Chat Panel */}
        {isOpen && (
          <div className="webroom-panel-wrapper">
            <WebRoomPanel room={room} onClose={() => setIsOpen(false)} />
          </div>
        )}

        {/* Floating Indicator Pill */}
        <button
          type="button"
          className={`webroom-pill ${isOpen ? "webroom-pill-active" : ""}`}
          onClick={toggleOpen}
          title={isOpen ? "Close WebRoom Chat" : "Open WebRoom Chat"}
          aria-expanded={isOpen}
          aria-label="WebRoom online indicator and chat toggle"
        >
          <div className="webroom-pulse-dot" />
          <span className="webroom-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className={`webroom-count ${bumping ? "webroom-count-bump" : ""}`}>
            {count}
          </span>
        </button>
      </div>
    </>
  );
};

