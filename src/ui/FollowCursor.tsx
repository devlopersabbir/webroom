import React, { useEffect, useState } from "react";
import { FollowCursorState, FollowSelectionState } from "../follow/follow-manager";
import { Room } from "../room/room";

interface FollowCursorProps {
  room: Room;
}

export const FollowCursor: React.FC<FollowCursorProps> = ({ room }) => {
  const [cursor, setCursor] = useState<FollowCursorState | null>(() => room.getLeaderCursor());
  const [selection, setSelection] = useState<FollowSelectionState | null>(() => room.getLeaderSelection());
  const [clickBursts, setClickBursts] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useEffect(() => {
    const unsubCursor = room.onFollowCursor((newCursor) => {
      setCursor(newCursor);

      if (newCursor?.isClicking) {
        const burstId = Date.now() + Math.random();
        setClickBursts((prev) => [...prev.slice(-4), { id: burstId, x: newCursor.clientX, y: newCursor.clientY }]);
        setTimeout(() => {
          setClickBursts((prev) => prev.filter((b) => b.id !== burstId));
        }, 600);
      }
    });

    const unsubSelection = room.onFollowSelection((newSelection) => {
      setSelection(newSelection);
    });

    return () => {
      unsubCursor();
      unsubSelection();
    };
  }, [room]);

  if (!cursor && !selection) {
    return null;
  }

  return (
    <div className="webroom-follow-cursor-overlay" aria-hidden="true">
      {/* Live Text Selection Highlight from Leader */}
      {selection && selection.selectedText && (
        <div
          className="webroom-selection-highlight"
          style={
            selection.rect
              ? {
                  position: "fixed",
                  top: `${selection.rect.top}px`,
                  left: `${selection.rect.left}px`,
                  width: `${Math.max(20, selection.rect.width)}px`,
                  height: `${Math.max(16, selection.rect.height)}px`,
                }
              : {
                  position: "fixed",
                  bottom: "24px",
                  left: "50%",
                  transform: "translateX(-50%)",
                }
          }
        >
          <div className="webroom-selection-box" />
          <div className="webroom-selection-badge">
            <span className="webroom-selection-avatar">{selection.leaderAvatar}</span>
            <span className="webroom-selection-text">
              Selected: "{selection.selectedText.length > 28 ? selection.selectedText.slice(0, 28) + "…" : selection.selectedText}"
            </span>
          </div>
        </div>
      )}

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
      {cursor && (
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
            <span className="webroom-cursor-label">
              {cursor.isHovering ? "Hovering" : "Following"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
