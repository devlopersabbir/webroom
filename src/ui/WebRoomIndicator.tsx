import React, { useEffect, useState } from "react";
import { Room } from "../room/room";

interface WebRoomIndicatorProps {
  room: Room;
}

export const WebRoomIndicator: React.FC<WebRoomIndicatorProps> = ({ room }) => {
  const [count, setCount] = useState<number>(room.getOnlineCount());
  const [bumping, setBumping] = useState<boolean>(false);

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

  const shortRoomId = `${room.roomId.slice(0, 6)}...${room.roomId.slice(-4)}`;
  const shortPeerId = `${room.peerId.slice(0, 10)}...`;

  return (
    <div className="webroom-floating-wrapper" id="webroom-indicator">
      <div className="webroom-tooltip">
        <div className="tooltip-header">
          <span className="tooltip-title">WebRoom V0</span>
          <span className="tooltip-badge">Live</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Room</span>
          <span className="tooltip-value" title={room.roomId}>{shortRoomId}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Peer</span>
          <span className="tooltip-value" title={room.peerId}>{shortPeerId}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Online</span>
          <span className="tooltip-value">{count} {count === 1 ? "peer" : "peers"}</span>
        </div>
      </div>

      <div className="webroom-pill" title="WebRoom: Online peers on this page">
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
      </div>
    </div>
  );
};
