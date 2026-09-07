import React, { useEffect, useState } from "react";
import { FollowPeerInfo } from "../follow/follow-store";
import { NodeRole, ROLE_DISPLAY_CONFIG } from "../roles/role-types";
import { Participant, Room } from "../room/room";
import { SendFileModal } from "./SendFileModal";

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
  const [roles, setRoles] = useState<Map<string, NodeRole>>(room.roleManager.getAllRoles());
  const [targetFileParticipant, setTargetFileParticipant] = useState<Participant | null>(null);

  useEffect(() => {
    const unsubscribe = room.onParticipantsChange((updated) => {
      setParticipants(updated);
    });
    return () => unsubscribe();
  }, [room]);

  useEffect(() => {
    const unsubscribe = room.onRoleChange((_, allRoles) => {
      setRoles(allRoles);
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

  // Find node role by peerId without re-triggering cluster evaluations
  const getRoleForPeer = (p: Participant): NodeRole => {
    if (p.isSelf) {
      return room.getSelfRole();
    }
    const node = room.membershipManager.getNodeByPeerId(p.peerId);
    if (node) {
      return roles.get(node.nodeId) || node.role || "participant";
    }
    return "participant";
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
          const role = getRoleForPeer(p);
          const roleConfig = ROLE_DISPLAY_CONFIG[role];

          return (
            <div
              key={p.peerId}
              className={`webroom-participant-item ${p.isSelf ? "webroom-participant-item-self" : "webroom-participant-item-clickable"} ${isCurrentlyFollowing ? "webroom-participant-item-following" : ""}`}
              onClick={() => !p.isSelf && handleToggleFollow(p)}
              title={p.isSelf ? `You (${roleConfig.label})` : isCurrentlyFollowing ? `Following ${p.avatar} (click to stop)` : `Click to follow ${p.avatar}`}
            >
              <div className="webroom-participant-avatar-wrap">
                <span className="webroom-participant-avatar">{p.avatar}</span>
                {isSpeaking && <span className="webroom-participant-speaking-dot" />}
              </div>

              <div className="webroom-participant-info">
                <div className="webroom-participant-name-row">
                  <span className="webroom-participant-label">
                    {p.isSelf ? "You" : `Participant ${p.avatar}`}
                  </span>
                  {p.isSelf && <span className="webroom-you-badge">YOU</span>}
                  <span
                    className={`webroom-participant-role-badge ${roleConfig.badgeClass}`}
                    title={roleConfig.description}
                  >
                    {roleConfig.icon} {roleConfig.label}
                  </span>
                </div>
                {isCurrentlyFollowing && (
                  <span className="webroom-following-tag">👁 Following</span>
                )}
              </div>

              {!p.isSelf && (
                <div className="webroom-participant-actions">
                  <button
                    type="button"
                    className="webroom-participant-upload-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTargetFileParticipant(p);
                    }}
                    title={`Send file directly to ${p.avatar}`}
                    aria-label={`Send file directly to ${p.avatar}`}
                  >
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
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`webroom-follow-btn ${isCurrentlyFollowing ? "webroom-follow-btn-active" : ""}`}
                    onClick={(e) => handleToggleFollow(p, e)}
                  >
                    {isCurrentlyFollowing ? "Following" : "Follow"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Direct File Transfer Modal */}
      {targetFileParticipant && (
        <SendFileModal
          room={room}
          target={targetFileParticipant}
          onClose={() => setTargetFileParticipant(null)}
        />
      )}
    </div>
  );
};
