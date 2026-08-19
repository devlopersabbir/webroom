import React, { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../chat/chat-protocol";
import { Room } from "../room/room";
import { ChatMessageItem } from "./ChatMessageItem";
import { MessageComposer } from "./MessageComposer";

interface WebRoomPanelProps {
  room: Room;
  onClose?: () => void;
}

export const WebRoomPanel: React.FC<WebRoomPanelProps> = ({ room, onClose }) => {
  const [onlineCount, setOnlineCount] = useState<number>(room.getOnlineCount());
  const [messages, setMessages] = useState<ChatMessage[]>(room.getMessages());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Subscribe to presence online count
  useEffect(() => {
    const unsubscribe = room.onCountChange((newCount) => {
      setOnlineCount(newCount);
    });
    return () => unsubscribe();
  }, [room]);

  // Subscribe to real-time chat messages
  useEffect(() => {
    const unsubscribe = room.onMessagesChange((newMessages) => {
      setMessages(newMessages);
    });
    return () => unsubscribe();
  }, [room]);

  // Track scroll position to prevent disrupting user if they scrolled up
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const threshold = 60;
    const isBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isNearBottomRef.current = isBottom;
  };

  // Auto-scroll on new messages if user was already near the bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isNearBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleSendMessage = (text: string) => {
    room.sendMessage(text);
    // User sent message -> ensure we scroll to bottom to view own message
    isNearBottomRef.current = true;
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 10);
  };

  const presenceText =
    onlineCount === 1 ? "👥 1 person here" : `👥 ${onlineCount} people here`;

  // Isolate all keyboard and mouse interactions from the host webpage
  const stopEventPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === "Escape" && onClose) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="webroom-panel"
      role="dialog"
      aria-label="WebRoom Chat Panel"
      onKeyDown={handleKeyDown}
      onKeyUp={stopEventPropagation}
      onKeyPress={stopEventPropagation}
      onMouseDown={stopEventPropagation}
      onMouseUp={stopEventPropagation}
      onClick={stopEventPropagation}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Panel Header */}
      <div className="webroom-panel-header">
        <div className="webroom-header-left">
          <div className="webroom-header-title-row">
            <span className="webroom-header-title">WebRoom</span>
            <span className="webroom-header-badge">V1</span>
          </div>
          <span className="webroom-header-presence">{presenceText}</span>
        </div>

        {/* Top-Right Settings Placeholder (No-op in V1) */}
        <button
          type="button"
          className="webroom-settings-btn"
          title="Settings (coming soon)"
          aria-label="Settings"
          tabIndex={-1}
        >
          ⚙️
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div
        className="webroom-messages-container"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="webroom-empty-state">
            <div className="webroom-empty-avatar">{room.avatar}</div>
            <p className="webroom-empty-title">
              {onlineCount === 1
                ? "You're the first one here. 👋"
                : "No messages yet. 👋"}
            </p>
            <p className="webroom-empty-subtitle">
              Say something and wait for others to join.
            </p>
          </div>
        ) : (
          <div className="webroom-messages-list">
            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                isSelf={msg.peerId === room.peerId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Message Composer */}
      <div className="webroom-panel-footer">
        <MessageComposer onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
};
