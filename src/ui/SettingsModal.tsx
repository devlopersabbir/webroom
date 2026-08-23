import React, { useEffect, useState } from "react";
import { NodeCapabilities } from "../resources/resource-budget";
import { Room } from "../room/room";

interface SettingsModalProps {
  room: Room;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ room, onClose }) => {
  const [capabilities, setCapabilities] = useState<NodeCapabilities>(
    room.resourceManager.getCapabilities()
  );
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = room.resourceManager.onCapabilitiesChange((caps) => {
      setCapabilities(caps);
    });
    return () => unsubscribe();
  }, [room]);

  const handleToggleContribution = async () => {
    setIsUpdating(true);
    try {
      await room.resourceManager.setContributionEnabled(!capabilities.contributionEnabled);
    } finally {
      setIsUpdating(false);
    }
  };

  const nodeId = room.identity.getNodeId();
  const truncatedNodeId = `${nodeId.slice(0, 14)}...${nodeId.slice(-8)}`;

  return (
    <div className="webroom-settings-overlay" onClick={onClose}>
      <div
        className="webroom-settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="WebRoom Settings"
      >
        <div className="webroom-settings-header">
          <h3 className="webroom-settings-title">⚙️ Settings & Resource Contribution</h3>
          <button
            type="button"
            className="webroom-settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="webroom-settings-body">
          {/* Cryptographic Identity Section */}
          <div className="webroom-settings-section">
            <h4 className="webroom-settings-section-title">Cryptographic Node Identity</h4>
            <div className="webroom-settings-card">
              <div className="webroom-settings-row">
                <span className="webroom-settings-label">Node ID</span>
                <span className="webroom-settings-value" title={nodeId}>
                  <code>{truncatedNodeId}</code>
                </span>
              </div>
              <div className="webroom-settings-row">
                <span className="webroom-settings-label">Algorithm</span>
                <span className="webroom-settings-badge">ECDSA NIST P-256</span>
              </div>
            </div>
          </div>

          {/* Resource Contribution Section */}
          <div className="webroom-settings-section">
            <div className="webroom-settings-section-header">
              <h4 className="webroom-settings-section-title">Voluntary Resource Contribution</h4>
              <button
                type="button"
                className={`webroom-toggle-switch ${
                  capabilities.contributionEnabled ? "webroom-toggle-switch-on" : ""
                }`}
                onClick={handleToggleContribution}
                disabled={isUpdating}
                role="switch"
                aria-checked={capabilities.contributionEnabled}
              >
                <span className="webroom-toggle-thumb" />
              </button>
            </div>
            <p className="webroom-settings-desc">
              When enabled, your browser voluntarily helps forward audio to other peers in large
              rooms. When disabled, you remain a full participant (speak, listen, chat) with zero
              relay forwarding duties.
            </p>

            <div className="webroom-settings-card">
              <div className="webroom-settings-row">
                <span className="webroom-settings-label">Relay Slots In Use</span>
                <span className="webroom-settings-value">
                  {capabilities.contributionEnabled
                    ? `${capabilities.activeRelays} / ${capabilities.maxRelaySlots} active`
                    : "Disabled"}
                </span>
              </div>
              <div className="webroom-settings-row">
                <span className="webroom-settings-label">Bandwidth Cap</span>
                <span className="webroom-settings-value">
                  {capabilities.contributionEnabled
                    ? `${capabilities.networkBudgetKbps} Kbps (Max)`
                    : "None (Direct only)"}
                </span>
              </div>
              <div className="webroom-settings-row">
                <span className="webroom-settings-label">CPU & Memory Heuristic</span>
                <span className="webroom-settings-badge">Conservative Low</span>
              </div>
            </div>
          </div>
        </div>

        <div className="webroom-settings-footer">
          <button type="button" className="webroom-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
