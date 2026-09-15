import React, { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../chat/chat-protocol";
import { FollowPeerInfo } from "../follow/follow-store";
import { Room } from "../room/room";
import { VoiceState } from "../voice/voice-manager";
import { ChatMessageItem } from "./ChatMessageItem";
import { MessageComposer } from "./MessageComposer";
import { ParticipantList } from "./ParticipantList";

declare const chrome: any;
declare const browser: any;

interface WebRoomPanelProps {
  room: Room;
  onClose?: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export const WebRoomPanel: React.FC<WebRoomPanelProps> = ({
  room,
  onClose,
  onHeaderPointerDown,
}) => {
  const [onlineCount, setOnlineCount] = useState<number>(room.getOnlineCount());
  const [messages, setMessages] = useState<ChatMessage[]>(room.getMessages());
  const [voiceState, setVoiceState] = useState<VoiceState>(room.getVoiceState());
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(room.getSpeakingPeers());
  const [followingLeader, setFollowingLeader] = useState<FollowPeerInfo | null>(room.getFollowing());
  const [showParticipants, setShowParticipants] = useState<boolean>(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Subscribe to presence online count
  useEffect(() => {
    const unsubscribe = room.onCountChange((newCount) => {
      setOnlineCount(newCount);
    });
    return () => unsubscribe();
  }, [room]);

  // Subscribe to voice quota notices (e.g. max 5 concurrent speakers)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = room.onVoiceQuotaExceeded((msg) => {
      setVoiceNotice(msg);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setVoiceNotice(null);
      }, 4000);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [room]);

  // Subscribe to follow changes
  useEffect(() => {
    const unsubscribe = room.onFollowChange((following) => {
      setFollowingLeader(following);
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

  // Subscribe to voice state (mic ON/OFF, speaker ON/OFF)
  useEffect(() => {
    const unsubscribe = room.onVoiceStateChange((newState) => {
      setVoiceState(newState);
    });
    return () => unsubscribe();
  }, [room]);

  // Subscribe to actively speaking peers
  useEffect(() => {
    const unsubscribe = room.onSpeakingChange((peers) => {
      setSpeakingPeers(peers);
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

  const handleToggleMic = async () => {
    await room.toggleMicrophone();
  };

  const handleToggleSpeaker = () => {
    room.toggleSpeaker();
  };

  const presenceText =
    onlineCount === 1 ? "👥 1 person here" : `👥 ${onlineCount} people here`;

  // Isolate all keyboard and mouse interactions from the host webpage
  const stopEventPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleOpenSettings = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else if (
      typeof browser !== "undefined" &&
      (browser as any).runtime?.openOptionsPage
    ) {
      (browser as any).runtime.openOptionsPage();
    } else if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      window.open(chrome.runtime.getURL("src/options/index.html"), "_blank");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === "Escape") {
      e.preventDefault();
      if (showParticipants) {
        setShowParticipants(false);
      } else if (onClose) {
        onClose();
      }
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
      <div
        className="webroom-panel-header"
        onPointerDown={onHeaderPointerDown}
      >
        <div className="webroom-header-left">
          <div className="webroom-header-title-row">
            <span className="webroom-header-title">WebRoom</span>
            <span className="webroom-header-badge">V3</span>
          </div>
          <button
            type="button"
            className={`webroom-header-presence-btn ${showParticipants ? "webroom-header-presence-btn-active" : ""}`}
            onClick={() => setShowParticipants((prev) => !prev)}
            onPointerDown={(e) => e.stopPropagation()}
            title="View participants & follow"
            aria-label={presenceText}
          >
            {presenceText}
          </button>
        </div>

        {/* Top-Right Voice Controls & Settings */}
        <div className="webroom-header-controls" onPointerDown={(e) => e.stopPropagation()}>
          {/* Microphone Toggle (🎙️) */}
          <button
            type="button"
            className={`webroom-voice-btn ${voiceState.isMicOn ? "webroom-voice-btn-mic-on" : "webroom-voice-btn-off"}`}
            onClick={handleToggleMic}
            title={voiceState.isMicOn ? "Microphone on" : "Microphone off"}
            aria-label={voiceState.isMicOn ? "Microphone on" : "Microphone off"}
          >
            <span className="webroom-btn-icon">🎙️</span>
            {voiceState.isMicOn && <span className="webroom-mic-indicator-dot" />}
          </button>

          {/* Speaker Toggle (🔊 / 🔇) */}
          <button
            type="button"
            className={`webroom-voice-btn ${voiceState.isSpeakerOn ? "webroom-voice-btn-speaker-on" : "webroom-voice-btn-off"}`}
            onClick={handleToggleSpeaker}
            title={voiceState.isSpeakerOn ? "Speaker on" : "Speaker off"}
            aria-label={voiceState.isSpeakerOn ? "Speaker on" : "Speaker off"}
          >
            <span className="webroom-btn-icon">{voiceState.isSpeakerOn ? "🔊" : "🔇"}</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            className="webroom-settings-btn"
            onClick={handleOpenSettings}
            title="Settings"
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Voice Quota Notification Toast */}
      {voiceNotice && (
        <div className="webroom-voice-toast" role="alert">
          <span className="webroom-voice-toast-icon">⚠️</span>
          <span className="webroom-voice-toast-text">{voiceNotice}</span>
        </div>
      )}

      {/* Participant List Overlay / Modal */}
      {showParticipants && (
        <ParticipantList
          room={room}
          onClose={() => setShowParticipants(false)}
          followingLeader={followingLeader}
          speakingPeers={speakingPeers}
        />
      )}

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
                isSpeaking={speakingPeers.has(msg.peerId)}
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


