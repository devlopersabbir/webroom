import React, { useEffect, useRef, useState } from "react";
import { NodeIdentity } from "../identity/node-identity";
import { NetworkNode } from "../membership/membership-store";
import { DEFAULT_RESOURCE_BUDGET, NodeCapabilities } from "../resources/resource-budget";
import { ResourceManager, RESOURCE_SHARING_STORAGE_KEY } from "../resources/resource-manager";
import { NodeRole, ROLE_DISPLAY_CONFIG } from "../roles/role-types";
import { Room } from "../room/room";
import { RoutingPlan } from "../routing/routing-types";
import { APP_VERSION } from "../shared/constants";

declare const chrome: any;

const DEFAULT_MONITOR_URL = "https://devlopersabbir.github.io/";

export const OptionsApp: React.FC = () => {
  const [monitorUrl, setMonitorUrl] = useState<string>(DEFAULT_MONITOR_URL);
  const [activeUrl, setActiveUrl] = useState<string>(DEFAULT_MONITOR_URL);
  const [identity, setIdentity] = useState<NodeIdentity | null>(null);
  const [resourceManager, setResourceManager] = useState<ResourceManager | null>(null);
  const [nodeId, setNodeId] = useState<string>("Initializing...");
  const [contributionEnabled, setContributionEnabled] = useState<boolean>(true);
  const [capabilities, setCapabilities] = useState<NodeCapabilities | null>(null);

  // Live Cluster State
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<NetworkNode[]>([]);
  const [selfRole, setSelfRole] = useState<NodeRole>("coordinator");
  const [roles, setRoles] = useState<Map<string, NodeRole>>(new Map());
  const [routingPlan, setRoutingPlan] = useState<RoutingPlan | null>(null);
  const [peerCount, setPeerCount] = useState<number>(1);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);

  // UI state
  const [activeTab, setActiveTab] = useState<"cluster" | "topology" | "architecture">("cluster");
  const [copied, setCopied] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  const roomRef = useRef<Room | null>(null);

  // 1-second ticker for real-time ping / lastSeen calculations
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Identity & Resources
  useEffect(() => {
    let isCancelled = false;

    async function init() {
      try {
        const id = await NodeIdentity.initialize();
        const resMgr = await ResourceManager.initialize();

        if (isCancelled) return;

        setIdentity(id);
        setResourceManager(resMgr);
        setNodeId(id.getNodeId());
        setContributionEnabled(resMgr.isContributionEnabled());
        setCapabilities(resMgr.getCapabilities());

        resMgr.onCapabilitiesChange((caps) => {
          setCapabilities(caps);
          setContributionEnabled(caps.contributionEnabled);
        });
      } catch (err) {
        console.error("[WebRoom Monitor] Error initializing node identity/resources:", err);
      }
    }

    init();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Connect to Live Real-Time Room
  useEffect(() => {
    if (!identity || !resourceManager) return;

    let isCancelled = false;
    setIsConnecting(true);

    if (roomRef.current) {
      roomRef.current.leave(false);
      roomRef.current = null;
    }

    async function connectRoom() {
      try {
        const liveRoom = await Room.join(activeUrl, {
          identity: identity || undefined,
          resourceManager: resourceManager || undefined,
        });

        if (isCancelled) {
          liveRoom.leave(false);
          return;
        }

        roomRef.current = liveRoom;
        setRoom(liveRoom);
        setSelfRole(liveRoom.getSelfRole());
        setRoles(liveRoom.roleManager.getAllRoles());
        setMembers(liveRoom.membershipManager.getMembers());
        setPeerCount(liveRoom.getOnlineCount());
        setRoutingPlan(liveRoom.getRoutingPlan());
        setIsConnecting(false);

        // Subscribe to live membership changes
        liveRoom.membershipManager.onMembershipChange((updatedMembers) => {
          if (!isCancelled) {
            setMembers([...updatedMembers]);
            setPeerCount(liveRoom.getOnlineCount());
          }
        });

        // Subscribe to live role changes
        liveRoom.onRoleChange((newSelfRole, allRoles) => {
          if (!isCancelled) {
            setSelfRole(newSelfRole);
            setRoles(new Map(allRoles));
          }
        });

        // Subscribe to live routing plan updates
        liveRoom.onRoutingChange((newPlan) => {
          if (!isCancelled) {
            setRoutingPlan({ ...newPlan });
          }
        });
      } catch (err) {
        console.error("[WebRoom Monitor] Failed to connect to room:", err);
        setIsConnecting(false);
      }
    }

    connectRoom();

    return () => {
      isCancelled = true;
      if (roomRef.current) {
        roomRef.current.leave(false);
        roomRef.current = null;
      }
    };
  }, [activeUrl, identity, resourceManager]);

  const handleToggleContribution = async () => {
    if (!resourceManager) return;
    setIsUpdating(true);
    try {
      const nextState = !contributionEnabled;
      await resourceManager.setContributionEnabled(nextState);
      setContributionEnabled(nextState);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [RESOURCE_SHARING_STORAGE_KEY]: nextState ? "true" : "false" });
      } else if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(RESOURCE_SHARING_STORAGE_KEY, nextState ? "true" : "false");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyNodeId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(nodeId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApplyUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (monitorUrl.trim() && monitorUrl !== activeUrl) {
      setActiveUrl(monitorUrl.trim());
    }
  };

  const selfRoleConfig = ROLE_DISPLAY_CONFIG[selfRole] || ROLE_DISPLAY_CONFIG.participant;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/20">
              🌐
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-white">WebRoom v3 Realtime Monitor</h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  v{APP_VERSION}
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Monitor Active
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Real-time zero-server P2P telemetry, signed heartbeats, live roles & media routing inspector
              </p>
            </div>
          </div>

          {/* Room URL Switcher */}
          <form onSubmit={handleApplyUrl} className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              value={monitorUrl}
              onChange={(e) => setMonitorUrl(e.target.value)}
              placeholder="Enter canonical webpage URL..."
              className="bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs text-slate-200 w-full md:w-64 font-mono"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shrink-0"
            >
              Monitor Room
            </button>
          </form>
        </header>

        {/* Node Overview Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Node Identity */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cryptographic Identity</span>
              <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-md font-mono">
                ECDSA NIST P-256
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Local Node ID (Browser Instance)</label>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-indigo-300 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 flex-1 truncate select-all">
                    {nodeId}
                  </code>
                  <button
                    onClick={handleCopyNodeId}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs transition shrink-0"
                    title="Copy full Node ID"
                  >
                    {copied ? "✅" : "📋"}
                  </button>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>🏢</span> Browser-Anchored Node Model:
                </div>
                <p>
                  All tabs and windows in this browser share this single cryptographic Node ID. Separate clients require distinct browsers (Chrome, Firefox), separate browser profiles, or different machines.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Cluster Role */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your Cluster Role</span>
              <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono">
                Deterministic
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selfRoleConfig.icon}</span>
                <div>
                  <div className="text-base font-bold text-white flex items-center gap-2">
                    {selfRoleConfig.label}
                  </div>
                  <span className="text-xs text-slate-400">{selfRoleConfig.description}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                Evaluated deterministically based on cluster liveness, capacity heuristics, and tie-breakers.
              </p>
            </div>
          </div>

          {/* Card 3: Resource Contribution Model */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Voluntary Contribution</span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-semibold ${
                  contributionEnabled
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
                }`}
              >
                {contributionEnabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Relay Sharing</div>
                  <div className="text-xs text-slate-400">Allow forwarding audio streams</div>
                </div>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={handleToggleContribution}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${
                    contributionEnabled ? "bg-indigo-600" : "bg-slate-700"
                  }`}
                  aria-label="Toggle resource sharing"
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                      contributionEnabled ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                <div>
                  <span className="text-slate-400">Relay Slots:</span>
                  <span className="font-semibold text-slate-200 ml-1">
                    {capabilities?.activeRelays ?? 0} / {capabilities?.maxRelaySlots ?? DEFAULT_RESOURCE_BUDGET.maxRelaySlots}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Budget Limit:</span>
                  <span className="font-semibold text-slate-200 ml-1">{DEFAULT_RESOURCE_BUDGET.networkBudgetKbps} Kbps</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
          <button
            onClick={() => setActiveTab("cluster")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === "cluster"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <span>👥 Live Cluster Nodes</span>
            <span className="px-1.5 py-0.2 text-xs bg-slate-800 text-slate-300 rounded font-mono">
              {members.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("topology")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center gap-2 ${
              activeTab === "topology"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <span>🗺️ Media Routing Matrix</span>
            <span className="px-1.5 py-0.2 text-xs bg-slate-800 text-slate-300 rounded font-mono">
              {routingPlan?.routes.size ?? 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("architecture")}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === "architecture"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            🏛️ 5-Layer Architecture Guide
          </button>
        </div>

        {/* Tab 1: 100% Real Live Cluster Nodes Table */}
        {activeTab === "cluster" && (
          <div className="space-y-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Live Cluster Membership Table</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      Room: {room?.roomId ? `${room.roomId.slice(0, 12)}...` : "Connecting..."}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Showing real cryptographic nodes communicating via WebRTC & signed ECDSA heartbeats on this URL
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-lg flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Heartbeat: 2.5s interval
                  </span>
                </div>
              </div>

              {isConnecting ? (
                <div className="py-12 text-center text-sm text-slate-400 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Connecting to decentralized room overlay...</span>
                </div>
              ) : members.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  No active nodes in this room. Open this page in another browser tab to see real-time peer discovery!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-3">Node / Peer ID</th>
                        <th className="p-3">Role Badge</th>
                        <th className="p-3">Liveness</th>
                        <th className="p-3">Heartbeat Seq</th>
                        <th className="p-3">Last Seen</th>
                        <th className="p-3">Relay Capacity</th>
                        <th className="p-3">Avatar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {members.map((node) => {
                        const isSelf = node.nodeId === nodeId;
                        const nodeRole = roles.get(node.nodeId) || node.role || (isSelf ? selfRole : "participant");
                        const nodeRoleConfig = ROLE_DISPLAY_CONFIG[nodeRole] || ROLE_DISPLAY_CONFIG.participant;
                        const elapsedSec = Math.max(0, Math.round((now - node.lastSeen) / 1000));

                        return (
                          <tr
                            key={node.nodeId}
                            className={`transition hover:bg-slate-800/30 ${isSelf ? "bg-indigo-950/20 font-medium" : ""}`}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <code className="text-indigo-300 font-mono" title={node.nodeId}>
                                  {node.nodeId.slice(0, 16)}...
                                </code>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500 text-white rounded font-bold">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Peer: {node.peerId}
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${
                                  nodeRole === "coordinator"
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : nodeRole === "relay"
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                    : nodeRole === "standby"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
                                }`}
                              >
                                {nodeRoleConfig.icon} {nodeRoleConfig.label}
                              </span>
                            </td>
                            <td className="p-3">
                              {node.status === "online" ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Online
                                </span>
                              ) : node.status === "suspected" ? (
                                <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> Suspected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-rose-400 font-semibold">
                                  <span className="w-2 h-2 rounded-full bg-rose-400"></span> Offline
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-300">
                              #{node.sequence}
                            </td>
                            <td className="p-3 text-slate-400 font-mono">
                              {isSelf ? "Active (Local)" : `${elapsedSec}s ago`}
                            </td>
                            <td className="p-3">
                              {node.contributionEnabled ? (
                                <span className="text-emerald-300">
                                  {node.capabilities?.availableRelaySlots ?? 2} / {node.capabilities?.maxRelaySlots ?? 2} slots
                                </span>
                              ) : (
                                <span className="text-slate-500">Non-contributor</span>
                              )}
                            </td>
                            <td className="p-3 text-lg">
                              {node.avatar || "🐸"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: 100% Real Live Media Routing Topology */}
        {activeTab === "topology" && (
          <div className="space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Live Media Routing Matrix</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time audio stream routing computed by MediaRoutingLayer (Direct P2P vs Bounded Relay)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg">
                    Topology: {members.length <= 3 ? "Direct Mesh (≤ 3 Nodes)" : "Bounded Relay Tree (> 3 Nodes)"}
                  </span>
                </div>
              </div>

              {!routingPlan || routingPlan.routes.size === 0 ? (
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-8 text-center space-y-3">
                  <div className="text-3xl">🎙️</div>
                  <div className="text-sm font-semibold text-slate-300">No Active Audio Streams</div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    When participants speak or enable microphone in this room, live Direct and Relayed routes will automatically appear here with full path telemetry!
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-3">Speaker (Publisher)</th>
                        <th className="p-3">Route Type</th>
                        <th className="p-3">Forwarding Path</th>
                        <th className="p-3">Listener (Subscriber)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {Array.from(routingPlan.routes.values()).map((route, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="p-3">
                            <code className="text-indigo-300 font-mono">
                              {route.speakerNodeId.slice(0, 14)}...
                            </code>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                route.routeType === "relay"
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}
                            >
                              {route.routeType === "relay" ? "⚡ Relayed" : "⟷ Direct P2P"}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-xs text-slate-400">
                            {route.path.map((id, pIdx) => (
                              <span key={pIdx}>
                                <span className={id === route.relayNodeId ? "text-blue-300 font-bold" : ""}>
                                  {id.slice(0, 10)}...
                                </span>
                                {pIdx < route.path.length - 1 && <span className="mx-1 text-slate-600">➔</span>}
                              </span>
                            ))}
                          </td>
                          <td className="p-3">
                            <code className="text-slate-300 font-mono">
                              {route.listenerNodeId.slice(0, 14)}...
                            </code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Architecture Guide */}
        {activeTab === "architecture" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Layer 1 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs border border-indigo-500/30">
                  1
                </span>
                Layer 1: Cryptographic Node Identity
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generates a zero-server <strong>ECDSA NIST P-256</strong> keypair persisted securely in extension storage. Node IDs are deterministic SHA-256 hashes of the exported public key, guaranteeing that no peer can forge another node's identity.
              </p>
            </div>

            {/* Layer 2 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs border border-indigo-500/30">
                  2
                </span>
                Layer 2: Distributed Membership & Signed Heartbeats
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every node periodically signs and broadcasts canonical heartbeat frames. Multi-stage failure detection transitions nodes from <code>online ➔ suspected (5s) ➔ offline (10s)</code> without false positives.
              </p>
            </div>

            {/* Layer 3 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs border border-indigo-500/30">
                  3
                </span>
                Layer 3: Voluntary Resource Contribution Model
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Users explicitly control resource sharing. Contributors declare a bounded budget (max 2 relay slots, 500 Kbps network limit) so that no node is ever overloaded.
              </p>
            </div>

            {/* Layer 4 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs border border-indigo-500/30">
                  4
                </span>
                Layer 4: Deterministic Coordination & Sticky Roles
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Implements the core coordination formula: <code>same membership + same capabilities + same ranking = same decision</code>. Includes incumbent coordinator stickiness to completely eliminate role churning on tab reloads.
              </p>
            </div>

            {/* Layer 5 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs border border-indigo-500/30">
                  5
                </span>
                Layer 5: Media Routing Layer & Distributed Relay Overlay
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Adaptive media routing dynamically constructs loop-free relay trees for audio streams, preserving publisher bandwidth while maintaining instant failover if a relay node disconnects.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <span>WebRoom v3 Realtime Cluster Monitor</span>
          <span>Open Source Peer-to-Peer Protocol &bull; Zero Server Infrastructure</span>
        </footer>
      </div>
    </div>
  );
};

export default OptionsApp;
