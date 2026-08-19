import React, { useEffect, useState } from "react";
import { FollowCursorState } from "../follow/follow-manager";
import { Room } from "../room/room";

interface FollowCursorProps {
  room: Room;
}

export const FollowCursor: React.FC<FollowCursorProps> = ({ room }) => {
  const [cursor, setCursor] = useState<FollowCursorState | null>(() => room.getLeaderCursor());
  const [clickBursts, setClickBursts] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useEffect(() => {
    const unsubscribe = room.onFollowCursor((newCursor) => {
      setCursor(newCursor);

      if (newCursor?.isClicking) {
        const burstId = Date.now() + Math.random();
        setClickBursts((prev) => [...prev.slice(-4), { id: burstId, x: newCursor.clientX, y: newCursor.clientY }]);
        setTimeout(() => {
          setClickBursts((prev) => prev.filter((b) => b.id !== burstId));
        }, 600);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [room]);

  if (!cursor) {
    return null;
  }

  return (
    <div className="webroom-follow-cursor-overlay" aria-hidden="true">
      {/* Click ripple bursts */}
      {clickBursts.map((burst) => (
        <div
          key={burst.id}
          className="webroom-cursor-click-ripple"
          style={{
            transform: `translate3d(${burst.x}px, ${burst.y}px, 0)`,
          }}
        />
      ))}

      {/* Main Leader Cursor */}
      <div
        className={`webroom-leader-cursor ${cursor.isHovering ? "webroom-cursor-hovering" : ""}`}
        style={{
          transform: `translate3d(${cursor.clientX}px, ${cursor.clientY}px, 0)`,
        }}
      >
        {/* Figma Style Cursor SVG */}
        <svg
          className="webroom-cursor-svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
            fill="#8B5CF6"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        {/* Floating Avatar Tag */}
        <div className="webroom-cursor-tag">
          <span className="webroom-cursor-avatar">{cursor.leaderAvatar}</span>
          <span className="webroom-cursor-label">Following</span>
        </div>
      </div>
    </div>
  );
};
