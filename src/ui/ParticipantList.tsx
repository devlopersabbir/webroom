import React, { useEffect, useState } from "react";
import { FollowPeerInfo } from "../follow/follow-store";
import { Participant, Room } from "../room/room";

interface ParticipantListProps {
  room: Room;
  onClose: () => void;
  followingLeader: FollowPeerInfo | null;
  speakingPeers: Set<string>;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  room,
  onClose,
  followingLeader,
  speakingPeers,
}) => {
  const [participants, setParticipants] = useState<Participant[]>(room.getParticipants());

  useEffect(() => {
    const unsubscribe = room.onParticipantsChange((updated) => {
      setParticipants(updated);
    });
    return () => unsubscribe();
  }, [room]);

  const handleToggleFollow = (p: Participant, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (p.isSelf) {
      return;
    }

    if (followingLeader?.peerId === p.peerId) {
      room.unfollowUser();
    } else {
      room.followUser(p.peerId, p.avatar);
    }
  };

  const stopEventPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="webroom-participant-list-modal"
      onClick={stopEventPropagation}
      onMouseDown={stopEventPropagation}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          onClose();
        }
      }}
    >
      <div className="webroom-participant-list-header">
        <div className="webroom-participant-title">
          <span>People here</span>
          <span className="webroom-participant-count-badge">{participants.length}</span>
        </div>
        <button
          type="button"
          className="webroom-participant-close-btn"
          onClick={onClose}
          aria-label="Close participant list"
        >
          ✕
        </button>
      </div>

      <div className="webroom-participant-items">
        {participants.map((p) => {
          const isCurrentlyFollowing = followingLeader?.peerId === p.peerId;
          const isSpeaking = speakingPeers.has(p.peerId);

          return (
            <div
              key={p.peerId}
              className={`webroom-participant-item ${p.isSelf ? "webroom-participant-item-self" : "webroom-participant-item-clickable"} ${isCurrentlyFollowing ? "webroom-participant-item-following" : ""}`}
              onClick={() => !p.isSelf && handleToggleFollow(p)}
              title={p.isSelf ? "You" : isCurrentlyFollowing ? `Following ${p.avatar} (click to stop)` : `Click to follow ${p.avatar}`}
            >
              <div className="webroom-participant-avatar-wrap">
                <span className="webroom-participant-avatar">{p.avatar}</span>
                {isSpeaking && <span className="webroom-participant-speaking-dot" />}
              </div>

              <div className="webroom-participant-info">
                <span className="webroom-participant-label">
                  {p.isSelf ? "You" : `Participant ${p.avatar}`}
                </span>
                {p.isSelf && <span className="webroom-you-badge">YOU</span>}
                {isCurrentlyFollowing && (
                  <span className="webroom-following-tag">👁 Following</span>
                )}
              </div>

              {!p.isSelf && (
                <button
                  type="button"
                  className={`webroom-follow-btn ${isCurrentlyFollowing ? "webroom-follow-btn-active" : ""}`}
                  onClick={(e) => handleToggleFollow(p, e)}
                >
                  {isCurrentlyFollowing ? "Following" : "Follow"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
