import React, { useEffect, useState } from "react";
import { formatFileSize } from "../file-transfer/file-transfer-protocol";
import { InboundTransfer } from "../file-transfer/file-transfer-manager";
import { Room } from "../room/room";

interface IncomingFileModalProps {
  room: Room;
}

export const IncomingFileModal: React.FC<IncomingFileModalProps> = ({ room }) => {
  const [inbound, setInbound] = useState<InboundTransfer | null>(
    room.fileTransferManager.getInboundTransfer(),
  );

  useEffect(() => {
    const unsubscribe = room.onInboundFileTransferChange((transfer) => {
      setInbound(transfer ? { ...transfer } : null);
    });
    return () => unsubscribe();
  }, [room]);

  useEffect(() => {
    if (inbound?.status === "CANCELLED") {
      const timer = setTimeout(() => {
        room.fileTransferManager.clearInbound();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [inbound?.status, room]);

  if (!inbound || inbound.status === "REJECTED") {
    return null;
  }

  const handleAccept = () => {
    room.acceptFileTransfer(inbound.transferId);
  };

  const handleReject = () => {
    room.rejectFileTransfer(inbound.transferId, "Recipient declined transfer");
    room.fileTransferManager.clearInbound();
  };

  const handleCancel = () => {
    room.cancelFileTransfer(inbound.transferId, "Recipient cancelled transfer");
    room.fileTransferManager.clearInbound();
  };

  const handleDone = () => {
    room.fileTransferManager.clearInbound();
  };

  const getFileIcon = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf":
        return "📄";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "webp":
      case "svg":
        return "🖼️";
      case "mp3":
      case "wav":
      case "flac":
      case "m4a":
        return "🎵";
      case "mp4":
      case "mkv":
      case "mov":
      case "webm":
        return "🎬";
      case "zip":
      case "tar":
      case "gz":
      case "7z":
      case "rar":
        return "📦";
      case "js":
      case "ts":
      case "json":
      case "html":
      case "css":
      case "py":
        return "💻";
      default:
        return "📁";
    }
  };

  return (
    <div
      className="webroom-file-modal-overlay webroom-incoming-modal-overlay"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="webroom-file-modal webroom-incoming-modal">
        {/* Header */}
        <div className="webroom-file-modal-header">
          <div className="webroom-file-modal-title">
            <span className="webroom-file-modal-avatar">{inbound.senderAvatar}</span>
            <div className="webroom-file-modal-title-text">
              <h4>Incoming Direct File</h4>
              <p>From: Participant {inbound.senderAvatar}</p>
            </div>
          </div>
          {inbound.status !== "RECEIVING" && (
            <button
              type="button"
              className="webroom-participant-close-btn"
              onClick={inbound.status === "AWAITING_ACCEPTANCE" ? handleReject : handleDone}
              aria-label="Close file transfer modal"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="webroom-file-modal-body">
          {inbound.status === "AWAITING_ACCEPTANCE" && (
            <>
              <p className="webroom-incoming-prompt">
                <strong>Participant {inbound.senderAvatar}</strong> wants to send you a file:
              </p>

              <div className="webroom-selected-file-card">
                <span className="webroom-file-type-icon">
                  {getFileIcon(inbound.fileMeta.name)}
                </span>
                <div className="webroom-selected-file-details">
                  <div className="webroom-selected-file-name" title={inbound.fileMeta.name}>
                    {inbound.fileMeta.name}
                  </div>
                  <div className="webroom-selected-file-size">
                    {formatFileSize(inbound.fileMeta.size)}
                  </div>
                </div>
              </div>

              <div className="webroom-transfer-note">
                🔒 <strong>100% P2P Transfer:</strong> Directly between browsers without middleman, servers, or cloud storage.
              </div>

              <div className="webroom-modal-actions-row">
                <button
                  type="button"
                  className="webroom-btn-ghost-danger"
                  onClick={handleReject}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="webroom-btn-success"
                  onClick={handleAccept}
                >
                  Accept &amp; Download ⬇
                </button>
              </div>
            </>
          )}

          {inbound.status === "RECEIVING" && (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-active-header">
                <span className="webroom-file-type-icon">
                  {getFileIcon(inbound.fileMeta.name)}
                </span>
                <div className="webroom-transfer-active-info">
                  <div className="webroom-transfer-file-name" title={inbound.fileMeta.name}>
                    {inbound.fileMeta.name}
                  </div>
                  <div className="webroom-transfer-metrics">
                    <span>
                      {formatFileSize(inbound.bytesReceived)} /{" "}
                      {formatFileSize(inbound.totalBytes)}
                    </span>
                    {inbound.speedBytesPerSec > 0 && (
                      <span className="webroom-transfer-speed">
                        ⚡ {formatFileSize(inbound.speedBytesPerSec)}/s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="webroom-progress-track">
                <div
                  className="webroom-progress-fill webroom-progress-fill-receiving"
                  style={{ width: `${Math.round(inbound.progress * 100)}%` }}
                />
              </div>
              <div className="webroom-progress-percentage">
                {Math.round(inbound.progress * 100)}% received
              </div>

              <button
                type="button"
                className="webroom-btn-ghost-danger"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          )}

          {inbound.status === "COMPLETED" && (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-success-icon">🎉</div>
              <h4 className="webroom-transfer-headline">File Downloaded!</h4>
              <p className="webroom-transfer-subtext">
                &quot;{inbound.fileMeta.name}&quot; was successfully received and saved to your Downloads folder.
              </p>
              <button
                type="button"
                className="webroom-btn-primary"
                onClick={handleDone}
              >
                Done
              </button>
            </div>
          )}

          {(inbound.status === "CANCELLED" || inbound.status === "ERROR") && (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-cancelled-icon">⚠️</div>
              <h4 className="webroom-transfer-headline">
                {inbound.status === "CANCELLED" ? "Transfer Cancelled" : "Transfer Interrupted"}
              </h4>
              <p className="webroom-transfer-subtext">
                {inbound.errorMessage || "The transfer was cancelled or sender disconnected."}
              </p>
              <button
                type="button"
                className="webroom-btn-secondary"
                onClick={handleDone}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
