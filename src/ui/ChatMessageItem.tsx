import React from "react";
import { ChatMessage } from "../chat/chat-protocol";

interface ChatMessageItemProps {
  message: ChatMessage;
  isSelf: boolean;
  isSpeaking?: boolean;
}

function formatTimestamp(timestamp: number): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  isSelf,
  isSpeaking = false,
}) => {
  const formattedTime = formatTimestamp(message.timestamp);

  if (isSelf) {
    return (
      <div className="webroom-message-row webroom-message-self">
        <div className="webroom-message-content">
          <div className="webroom-message-bubble webroom-bubble-self">
            <p className="webroom-message-text">{message.text}</p>
          </div>
          <span className="webroom-message-time">{formattedTime}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="webroom-message-row webroom-message-peer">
      <div
        className={`webroom-message-avatar ${isSpeaking ? "webroom-avatar-speaking" : ""}`}
        title={`Peer ${message.peerId.slice(0, 8)}${isSpeaking ? " (Speaking 🎙️)" : ""}`}
      >
        {message.avatar}
      </div>
      <div className="webroom-message-content">
        <div className="webroom-message-bubble webroom-bubble-peer">
          <p className="webroom-message-text">{message.text}</p>
        </div>
        <span className="webroom-message-time">{formattedTime}</span>
      </div>
    </div>
  );
};

