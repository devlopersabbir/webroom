import React, { useEffect, useRef, useState } from "react";
import { formatFileSize } from "../file-transfer/file-transfer-protocol";
import { OutboundTransfer } from "../file-transfer/file-transfer-manager";
import { Participant, Room } from "../room/room";

interface SendFileModalProps {
  room: Room;
  target: Participant;
  onClose: () => void;
}

export const SendFileModal: React.FC<SendFileModalProps> = ({
  room,
  target,
  onClose,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(
    room.fileTransferManager.getOutboundTransfer()?.file || null,
  );
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [outbound, setOutbound] = useState<OutboundTransfer | null>(
    room.fileTransferManager.getOutboundTransfer(),
  );
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(
    room.fileTransferManager.getRejectionCooldownMs(target.peerId),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = room.onOutboundFileTransferChange((transfer) => {
      setOutbound(transfer);
      if (transfer?.file && !selectedFile) {
        setSelectedFile(transfer.file);
      }
    });
    return () => unsubscribe();
  }, [room, selectedFile]);

  useEffect(() => {
    const updateCooldown = () => {
      const remaining = room.fileTransferManager.getRejectionCooldownMs(target.peerId);
      setCooldownRemainingMs(remaining);
    };
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [room, target.peerId, outbound?.status]);

  const formatCooldown = (ms: number): string => {
    const totalSec = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if (!selectedFile) return;
    try {
      await room.requestSendFile(target.peerId, target.avatar, selectedFile);
    } catch (err) {
      console.error("[WebRoom UI] Failed to request send file:", err);
    }
  };

  const handleClose = () => {
    if (outbound && (outbound.status === "AWAITING_CONSENT" || outbound.status === "TRANSFERRING")) {
      room.cancelFileTransfer(outbound.transferId, "Sender cancelled");
    }
    room.fileTransferManager.clearOutbound();
    onClose();
  };

  const handleCancel = () => {
    handleClose();
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

  const isTransferActive =
    outbound &&
    (outbound.status === "AWAITING_CONSENT" ||
      outbound.status === "TRANSFERRING");

  return (
    <div
      className="webroom-file-modal-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (!isTransferActive) handleClose();
      }}
    >
      <div
        className="webroom-file-modal"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !isTransferActive) {
            handleClose();
          }
        }}
      >
        {/* Modal Header */}
        <div className="webroom-file-modal-header">
          <div className="webroom-file-modal-title">
            <span className="webroom-file-modal-avatar">{target.avatar}</span>
            <div className="webroom-file-modal-title-text">
              <h4>Send File Directly</h4>
              <p>Target: Participant {target.avatar}</p>
            </div>
          </div>
          {!isTransferActive && (
            <button
              type="button"
              className="webroom-participant-close-btn"
              onClick={handleClose}
              aria-label="Close send file modal"
            >
              ✕
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="webroom-file-modal-body">
          {/* Transfer State Machine Screens */}
          {outbound?.status === "AWAITING_CONSENT" ? (
            <div className="webroom-transfer-status-view">
              <div className="webroom-pulsing-loader">
                <span className="webroom-pulse-avatar">{target.avatar}</span>
              </div>
              <h4 className="webroom-transfer-headline">
                Waiting for {target.avatar} to accept...
              </h4>
              <p className="webroom-transfer-subtext">
                Transfer request sent for &quot;{outbound.file.name}&quot; (
                {formatFileSize(outbound.totalBytes)}).
              </p>
              <div className="webroom-transfer-privacy-badge">
                🔒 Zero middleman • Direct peer-to-peer connection
              </div>
              <button
                type="button"
                className="webroom-btn-danger"
                onClick={handleCancel}
              >
                Cancel Transfer
              </button>
            </div>
          ) : outbound?.status === "TRANSFERRING" ? (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-active-header">
                <span className="webroom-file-type-icon">
                  {getFileIcon(outbound.file.name)}
                </span>
                <div className="webroom-transfer-active-info">
                  <div className="webroom-transfer-file-name" title={outbound.file.name}>
                    {outbound.file.name}
                  </div>
                  <div className="webroom-transfer-metrics">
                    <span>
                      {formatFileSize(outbound.bytesTransferred)} /{" "}
                      {formatFileSize(outbound.totalBytes)}
                    </span>
                    {outbound.speedBytesPerSec > 0 && (
                      <span className="webroom-transfer-speed">
                        ⚡ {formatFileSize(outbound.speedBytesPerSec)}/s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="webroom-progress-track">
                <div
                  className="webroom-progress-fill"
                  style={{ width: `${Math.round(outbound.progress * 100)}%` }}
                />
              </div>
              <div className="webroom-progress-percentage">
                {Math.round(outbound.progress * 100)}% sent
              </div>

              <button
                type="button"
                className="webroom-btn-ghost-danger"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          ) : outbound?.status === "COMPLETED" ? (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-success-icon">🎉</div>
              <h4 className="webroom-transfer-headline">Transfer Complete!</h4>
              <p className="webroom-transfer-subtext">
                &quot;{outbound.file.name}&quot; was successfully delivered directly to{" "}
                {target.avatar}.
              </p>
              <button
                type="button"
                className="webroom-btn-primary"
                onClick={() => {
                  room.fileTransferManager.clearOutbound();
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          ) : outbound?.status === "REJECTED" ? (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-rejected-icon">✋</div>
              <h4 className="webroom-transfer-headline">Transfer Declined</h4>
              <p className="webroom-transfer-subtext">
                {outbound.errorMessage || `Participant ${target.avatar} declined the file transfer request.`}
              </p>

              {cooldownRemainingMs > 0 && (
                <div className="webroom-cooldown-badge">
                  ⏱️ <strong>Rate limit active:</strong> 3 requests declined within a minute. Sending is blocked for {formatCooldown(cooldownRemainingMs)}.
                </div>
              )}

              <div className="webroom-modal-actions-row">
                <button
                  type="button"
                  className="webroom-btn-ghost"
                  onClick={handleClose}
                >
                  Close
                </button>
                {cooldownRemainingMs > 0 ? (
                  <button
                    type="button"
                    className="webroom-btn-primary"
                    disabled
                  >
                    Send Again ({formatCooldown(cooldownRemainingMs)})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="webroom-btn-primary"
                    onClick={async () => {
                      if (selectedFile) {
                        try {
                          await room.requestSendFile(target.peerId, target.avatar, selectedFile);
                        } catch (err) {
                          console.error("[WebRoom UI] Failed to send again:", err);
                        }
                      }
                    }}
                  >
                    Send Again ↺
                  </button>
                )}
                {cooldownRemainingMs <= 0 && (
                  <button
                    type="button"
                    className="webroom-btn-secondary"
                    onClick={() => {
                      room.fileTransferManager.clearOutbound();
                      setSelectedFile(null);
                    }}
                  >
                    Pick Another File
                  </button>
                )}
              </div>
            </div>
          ) : outbound?.status === "CANCELLED" || outbound?.status === "ERROR" ? (
            <div className="webroom-transfer-status-view">
              <div className="webroom-transfer-cancelled-icon">⚠️</div>
              <h4 className="webroom-transfer-headline">
                {outbound.status === "CANCELLED" ? "Transfer Cancelled" : "Transfer Interrupted"}
              </h4>
              <p className="webroom-transfer-subtext">
                {outbound.errorMessage || "The transfer was cancelled or peer disconnected."}
              </p>
              <div className="webroom-modal-actions-row">
                <button
                  type="button"
                  className="webroom-btn-ghost"
                  onClick={handleClose}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="webroom-btn-primary"
                  onClick={() => {
                    room.fileTransferManager.clearOutbound();
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* File Selector & Drop Zone */}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              {!selectedFile ? (
                <div
                  className={`webroom-file-dropzone ${isDragging ? "webroom-file-dropzone-dragging" : ""}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload file drop area"
                >
                  <div className="webroom-dropzone-icon-wrap">
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="webroom-dropzone-main-text">
                    Drop a file here or <span>browse</span>
                  </div>
                  <div className="webroom-dropzone-sub-text">
                    Send any file directly to Participant {target.avatar}
                  </div>
                </div>
              ) : (
                <div className="webroom-selected-file-card">
                  <span className="webroom-file-type-icon">
                    {getFileIcon(selectedFile.name)}
                  </span>
                  <div className="webroom-selected-file-details">
                    <div className="webroom-selected-file-name" title={selectedFile.name}>
                      {selectedFile.name}
                    </div>
                    <div className="webroom-selected-file-size">
                      {formatFileSize(selectedFile.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="webroom-change-file-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change
                  </button>
                </div>
              )}

              {cooldownRemainingMs > 0 && (
                <div className="webroom-cooldown-badge">
                  ⏱️ <strong>Rate limit active:</strong> Participant {target.avatar} declined 3 requests within 1 minute. Please wait {formatCooldown(cooldownRemainingMs)} before requesting again.
                </div>
              )}

              {/* Privacy Guarantee Footer */}
              <div className="webroom-file-modal-footer">
                <div className="webroom-transfer-note">
                  🔒 <strong>P2P Direct:</strong> Sent browser-to-browser via WebRTC DataChannel. No middleman, zero cloud storage.
                </div>
                <div className="webroom-modal-actions-row">
                  <button
                    type="button"
                    className="webroom-btn-ghost"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="webroom-btn-primary"
                    disabled={!selectedFile || cooldownRemainingMs > 0}
                    onClick={handleSend}
                  >
                    {cooldownRemainingMs > 0
                      ? `Blocked (${formatCooldown(cooldownRemainingMs)})`
                      : "Request Transfer ➔"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
