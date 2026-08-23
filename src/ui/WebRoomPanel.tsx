import React, { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../chat/chat-protocol";
import { FollowPeerInfo } from "../follow/follow-store";
import { Room } from "../room/room";
import { VoiceState } from "../voice/voice-manager";
import { ChatMessageItem } from "./ChatMessageItem";
import { MessageComposer } from "./MessageComposer";
import { ParticipantList } from "./ParticipantList";
import { SettingsModal } from "./SettingsModal";

interface WebRoomPanelProps {
  room: Room;
  onClose?: () => void;
}

export const WebRoomPanel: React.FC<WebRoomPanelProps> = ({ room, onClose }) => {
  const [onlineCount, setOnlineCount] = useState<number>(room.getOnlineCount());
  const [messages, setMessages] = useState<ChatMessage[]>(room.getMessages());
  const [voiceState, setVoiceState] = useState<VoiceState>(room.getVoiceState());
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(room.getSpeakingPeers());
  const [followingLeader, setFollowingLeader] = useState<FollowPeerInfo | null>(room.getFollowing());
  const [showParticipants, setShowParticipants] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Subscribe to presence online count
  useEffect(() => {
    const unsubscribe = room.onCountChange((newCount) => {
      setOnlineCount(newCount);
    });
    return () => unsubscribe();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === "Escape") {
      e.preventDefault();
      if (showSettings) {
        setShowSettings(false);
      } else if (showParticipants) {
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
      <div className="webroom-panel-header">
        <div className="webroom-header-left">
          <div className="webroom-header-title-row">
            <span className="webroom-header-title">WebRoom</span>
            <span className="webroom-header-badge">V3</span>
          </div>
          <button
            type="button"
            className={`webroom-header-presence-btn ${showParticipants ? "webroom-header-presence-btn-active" : ""}`}
            onClick={() => setShowParticipants((prev) => !prev)}
            title="View participants & follow"
            aria-label={presenceText}
          >
            {presenceText}
          </button>
        </div>

        {/* Top-Right Voice Controls & Settings */}
        <div className="webroom-header-controls">
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
            className={`webroom-settings-btn ${showSettings ? "webroom-settings-btn-active" : ""}`}
            onClick={() => setShowSettings((prev) => !prev)}
            title="Settings & Resource Contribution"
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal room={room} onClose={() => setShowSettings(false)} />
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


