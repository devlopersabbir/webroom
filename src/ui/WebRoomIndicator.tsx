import React, { useCallback, useEffect, useRef, useState } from "react";
import { FollowPeerInfo } from "../follow/follow-store";
import { Participant, Room } from "../room/room";
import { FollowBorder } from "./FollowBorder";
import { FollowCursor } from "./FollowCursor";
import { FollowingIndicator } from "./FollowingIndicator";
import { IncomingFileModal } from "./IncomingFileModal";
import {
  clampPosition,
  computePanelPlacement,
  DEFAULT_PILL_HEIGHT,
  DEFAULT_PILL_WIDTH,
  getDefaultIndicatorPosition,
  loadSavedIndicatorPosition,
  Position,
  saveIndicatorPosition,
} from "./indicator-position";
import { SendFileModal } from "./SendFileModal";
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
  const [sendFileTarget, setSendFileTarget] = useState<Participant | null>(() => room.getSendFileTarget());

  // Indicator position & dragging state
  const [pos, setPos] = useState<Position>(() => {
    const saved = loadSavedIndicatorPosition();
    const viewport = {
      width: typeof window !== "undefined" ? window.innerWidth : 1440,
      height: typeof window !== "undefined" ? window.innerHeight : 900,
    };
    if (saved) {
      return clampPosition(saved, DEFAULT_PILL_WIDTH, DEFAULT_PILL_HEIGHT, viewport);
    }
    return getDefaultIndicatorPosition(DEFAULT_PILL_WIDTH, DEFAULT_PILL_HEIGHT, viewport);
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const pillRef = useRef<HTMLButtonElement>(null);
  const justDraggedRef = useRef<boolean>(false);
  const dragStateRef = useRef<{
    pointerStartX: number;
    pointerStartY: number;
    posStartX: number;
    posStartY: number;
    hasMoved: boolean;
  } | null>(null);

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

  useEffect(() => {
    const unsubscribe = room.onSendFileTargetChange((target) => {
      setSendFileTarget(target);
    });

    return () => {
      unsubscribe();
    };
  }, [room]);

  // Handle ESC key to close the panel cleanly without triggering host page shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sendFileTarget) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          room.setSendFileTarget(null);
        } else if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setIsOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, sendFileTarget, room]);

  // Keep button within bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const pillW = pillRef.current?.offsetWidth || DEFAULT_PILL_WIDTH;
        const pillH = pillRef.current?.offsetHeight || DEFAULT_PILL_HEIGHT;
        return clampPosition(prev, pillW, pillH, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Drag interaction handler (shared for pill and panel header)
  const startDragging = useCallback(
    (clientX: number, clientY: number) => {
      dragStateRef.current = {
        pointerStartX: clientX,
        pointerStartY: clientY,
        posStartX: pos.x,
        posStartY: pos.y,
        hasMoved: false,
      };

      const handlePointerMove = (e: PointerEvent) => {
        if (!dragStateRef.current) return;
        const dx = e.clientX - dragStateRef.current.pointerStartX;
        const dy = e.clientY - dragStateRef.current.pointerStartY;

        if (!dragStateRef.current.hasMoved && Math.hypot(dx, dy) > 4) {
          dragStateRef.current.hasMoved = true;
          setIsDragging(true);
        }

        if (dragStateRef.current.hasMoved) {
          e.preventDefault();
          e.stopPropagation();
          const pillW = pillRef.current?.offsetWidth || DEFAULT_PILL_WIDTH;
          const pillH = pillRef.current?.offsetHeight || DEFAULT_PILL_HEIGHT;
          const nextPos = clampPosition(
            {
              x: dragStateRef.current.posStartX + dx,
              y: dragStateRef.current.posStartY + dy,
            },
            pillW,
            pillH,
            { width: window.innerWidth, height: window.innerHeight }
          );
          setPos(nextPos);
        }
      };

      const handlePointerUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", handlePointerMove, true);
        window.removeEventListener("pointerup", handlePointerUp, true);
        window.removeEventListener("pointercancel", handlePointerUp, true);

        if (dragStateRef.current?.hasMoved) {
          justDraggedRef.current = true;
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 80);

          const pillW = pillRef.current?.offsetWidth || DEFAULT_PILL_WIDTH;
          const pillH = pillRef.current?.offsetHeight || DEFAULT_PILL_HEIGHT;
          const dx = e.clientX - dragStateRef.current.pointerStartX;
          const dy = e.clientY - dragStateRef.current.pointerStartY;
          const finalPos = clampPosition(
            {
              x: dragStateRef.current.posStartX + dx,
              y: dragStateRef.current.posStartY + dy,
            },
            pillW,
            pillH,
            { width: window.innerWidth, height: window.innerHeight }
          );

          setPos(finalPos);
          saveIndicatorPosition(finalPos);
        }

        dragStateRef.current = null;
        setIsDragging(false);
      };

      window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
      window.addEventListener("pointerup", handlePointerUp, { capture: true });
      window.addEventListener("pointercancel", handlePointerUp, { capture: true });
    },
    [pos]
  );

  const handlePillPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // only left click
    startDragging(e.clientX, e.clientY);
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startDragging(e.clientX, e.clientY);
  };

  const handlePillClick = () => {
    if (justDraggedRef.current) return;
    setIsOpen((prev) => !prev);
  };

  // Compute panel placement from current button position
  const pillW = pillRef.current?.offsetWidth || DEFAULT_PILL_WIDTH;
  const pillH = pillRef.current?.offsetHeight || DEFAULT_PILL_HEIGHT;
  const viewport = {
    width: typeof window !== "undefined" ? window.innerWidth : 1440,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
  };
  const panelPlacement = computePanelPlacement(pos, pillW, pillH, viewport);

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

      {/* 1-to-1 P2P Direct Send File Modal (Centered in Viewport) */}
      {sendFileTarget && (
        <SendFileModal
          room={room}
          target={sendFileTarget}
          onClose={() => room.setSendFileTarget(null)}
        />
      )}

      {/* 1-to-1 P2P Direct Incoming File Transfer Consent Modal (Centered in Viewport) */}
      <IncomingFileModal room={room} />

      {/* WebRoom Floating Indicator and Anchored Panel Container */}
      <div className="webroom-floating-wrapper" id="webroom-indicator">
        {/* Floating Chat Panel anchored to the indicator's position */}
        {isOpen && (
          <div
            className="webroom-panel-wrapper"
            style={{
              left: `${panelPlacement.left}px`,
              top: `${panelPlacement.top}px`,
              width: `${panelPlacement.width}px`,
              height: `${panelPlacement.height}px`,
              transformOrigin: panelPlacement.transformOrigin,
            }}
          >
            <WebRoomPanel
              room={room}
              onClose={() => setIsOpen(false)}
              onHeaderPointerDown={handleHeaderPointerDown}
            />
          </div>
        )}

        {/* Draggable Floating Presence Pill */}
        <button
          ref={pillRef}
          type="button"
          className={`webroom-pill ${isOpen ? "webroom-pill-active" : ""} ${isDragging ? "webroom-pill-dragging" : ""}`}
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
          }}
          onPointerDown={handlePillPointerDown}
          onClick={handlePillClick}
          title={isOpen ? "Close WebRoom Chat" : "Drag anywhere or click to open WebRoom Chat"}
          aria-expanded={isOpen}
          aria-label="WebRoom online indicator and chat toggle"
        >
          {/* Visual Drag Grip Handle */}
          <span className="webroom-drag-handle" title="Drag to reposition">
            <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
              <circle cx="1.5" cy="2" r="1" />
              <circle cx="4.5" cy="2" r="1" />
              <circle cx="1.5" cy="5" r="1" />
              <circle cx="4.5" cy="5" r="1" />
              <circle cx="1.5" cy="8" r="1" />
              <circle cx="4.5" cy="8" r="1" />
            </svg>
          </span>

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
