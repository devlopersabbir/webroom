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

const GLOBAL_CLUSTER_MESH_URL = "webroom://global-cluster-mesh";

interface PacketLog {
  id: string;
  time: string;
  type: "IN" | "OUT" | "SYS" | "ROLE" | "ROUTE";
  summary: string;
  data?: any;
}

export const OptionsApp: React.FC = () => {
  const [networkMode, setNetworkMode] = useState<"global" | "custom">("global");
  const [customUrl, setCustomUrl] = useState<string>("https://devlopersabbir.github.io/");
  const [activeUrl, setActiveUrl] = useState<string>(GLOBAL_CLUSTER_MESH_URL);

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
  const [logs, setLogs] = useState<PacketLog[]>([]);
  const [showJsonState, setShowJsonState] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  const roomRef = useRef<Room | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const addLog = (type: PacketLog["type"], summary: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev.slice(-99),
      {
        id: Math.random().toString(36).slice(2),
        time: timestamp,
        type,
        summary,
        data,
      },
    ]);
  };

  // 1-second ticker for real-time ping / lastSeen & polling latest cluster state
  useEffect(() => {
    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);

      if (roomRef.current) {
        const liveMembers = roomRef.current.membershipManager.getMembers();
        const liveRoles = roomRef.current.roleManager.getAllRoles();
        const liveSelfRole = roomRef.current.getSelfRole();
        const livePlan = roomRef.current.getRoutingPlan();

        setMembers([...liveMembers]);
        setRoles(new Map(liveRoles));
        setSelfRole(liveSelfRole);
        if (livePlan) {
          setRoutingPlan({ ...livePlan });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

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

        addLog("SYS", `Node Identity initialized: ${id.getNodeId().slice(0, 16)}... (ECDSA NIST P-256)`);

        resMgr.onCapabilitiesChange((caps) => {
          setCapabilities(caps);
          setContributionEnabled(caps.contributionEnabled);
          addLog("SYS", `Resource budget: ${caps.contributionEnabled ? "CONTRIBUTING" : "DISABLED"} (${caps.availableRelaySlots}/${caps.maxRelaySlots} slots)`);
        });
      } catch (err) {
        addLog("SYS", `Error initializing identity: ${String(err)}`);
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

    if (roomRef.current) {
      roomRef.current.leave(false);
      roomRef.current = null;
    }

    async function connectRoom() {
      try {
        const isGlobal = activeUrl === GLOBAL_CLUSTER_MESH_URL;
        addLog("SYS", isGlobal ? "Connecting to Global Decentralized Cluster Mesh..." : `Connecting to Subnet Room: ${activeUrl}`);

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
        setRoutingPlan(liveRoom.getRoutingPlan());

        addLog("SYS", `Connected to Mesh ${liveRoom.roomId.slice(0, 16)}... (Peer: ${liveRoom.peerId})`);

        // Subscribe to live membership changes
        liveRoom.membershipManager.onMembershipChange((updatedMembers) => {
          if (!isCancelled) {
            setMembers([...updatedMembers]);
            addLog("IN", `Cluster membership updated: ${updatedMembers.length} active node(s) discovered`);
          }
        });

        // Subscribe to live role changes
        liveRoom.onRoleChange((newSelfRole, allRoles) => {
          if (!isCancelled) {
            setSelfRole(newSelfRole);
            setRoles(new Map(allRoles));
            const coordId = liveRoom.roleManager.getCoordinatorNodeId();
            addLog("ROLE", `Role updated: Local is ${newSelfRole.toUpperCase()} (Coordinator: ${coordId?.slice(0, 14)}...)`);
          }
        });

        // Subscribe to live routing plan updates
        liveRoom.onRoutingChange((newPlan) => {
          if (!isCancelled) {
            setRoutingPlan({ ...newPlan });
            addLog("ROUTE", `Routing plan: ${newPlan.directRouteCount} direct, ${newPlan.relayRouteCount} relayed`);
          }
        });
      } catch (err) {
        addLog("SYS", `Failed to join mesh: ${String(err)}`);
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

  const handleSwitchToGlobal = () => {
    setNetworkMode("global");
    setActiveUrl(GLOBAL_CLUSTER_MESH_URL);
  };

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim()) {
      setNetworkMode("custom");
      setActiveUrl(customUrl.trim());
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      addLog("SYS", `Copied: ${text.slice(0, 24)}...`);
    }
  };

  const selfRoleConfig = ROLE_DISPLAY_CONFIG[selfRole] || ROLE_DISPLAY_CONFIG.participant;
  const coordinatorNodeId = room?.roleManager.getCoordinatorNodeId();

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] p-4 font-mono text-xs selection:bg-[#1f6feb] selection:text-white">
      {/* Top Header */}
      <header className="border-b border-[#30363d] pb-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-[#238636] text-white font-bold text-xs rounded">
            WEBROOM CLUSTER DEVTOOLS
          </div>
          <span className="text-[#8b949e]">v{APP_VERSION}</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            REAL-TIME MESH ACTIVE
          </span>
          <span className="text-[#8b949e] border-l border-[#30363d] pl-3">
            Mesh ID: <code className="text-[#58a6ff]">{room?.roomId ? room.roomId.slice(0, 16) : "connecting"}...</code>
          </span>
        </div>

        {/* Network Mode Switcher */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSwitchToGlobal}
            className={`px-2.5 py-1 border rounded text-xs font-medium transition ${
              networkMode === "global"
                ? "bg-[#1f6feb] border-[#1f6feb] text-white font-bold"
                : "bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-[#c9d1d9]"
            }`}
          >
            🌐 Global Cluster (All Nodes)
          </button>

          <form onSubmit={handleApplyCustomUrl} className="flex items-center gap-1.5">
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Specific Room / URL..."
              className="bg-[#161b22] border border-[#30363d] focus:border-[#58a6ff] focus:outline-none rounded px-2 py-1 text-xs text-[#c9d1d9] w-52"
            />
            <button
              type="submit"
              className={`px-2 py-1 border rounded text-xs font-medium transition ${
                networkMode === "custom"
                  ? "bg-[#1f6feb] border-[#1f6feb] text-white font-bold"
                  : "bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-[#c9d1d9]"
              }`}
            >
              Filter Room
            </button>
          </form>

          <button
            type="button"
            onClick={() => setShowJsonState(!showJsonState)}
            className={`px-2.5 py-1 border rounded transition ${
              showJsonState
                ? "bg-[#1f6feb] border-[#1f6feb] text-white"
                : "bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-[#c9d1d9]"
            }`}
          >
            {showJsonState ? "Hide JSON" : "Inspect JSON"}
          </button>
        </div>
      </header>

      {/* Cluster Overview Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#161b22] border border-[#30363d] p-2.5 rounded">
          <div className="text-[#8b949e] text-[10px] uppercase">This Browser Client (Self)</div>
          <div className="text-[#58a6ff] font-bold truncate mt-0.5" title={nodeId}>
            {nodeId}
          </div>
          <div className="text-[10px] text-[#8b949e] mt-1">ECDSA NIST P-256 Keypair</div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] p-2.5 rounded">
          <div className="text-[#8b949e] text-[10px] uppercase">Elected Coordinator</div>
          <div className="font-bold text-white mt-0.5 flex items-center gap-1.5">
            <span className="text-amber-400">👑</span>
            <span className="truncate text-amber-300">
              {coordinatorNodeId
                ? coordinatorNodeId === nodeId
                  ? "YOU (Coordinator)"
                  : `${coordinatorNodeId.slice(0, 14)}...`
                : "Electing..."}
            </span>
          </div>
          <div className="text-[10px] text-[#8b949e] mt-1">
            Local Role: <span className="font-bold text-slate-200">{selfRole.toUpperCase()}</span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] p-2.5 rounded">
          <div className="text-[#8b949e] text-[10px] uppercase flex justify-between">
            <span>Resource Contribution</span>
            <button
              onClick={handleToggleContribution}
              disabled={isUpdating}
              className="text-[#58a6ff] hover:underline text-[10px]"
            >
              [Toggle]
            </button>
          </div>
          <div className="font-bold text-white mt-0.5">
            {contributionEnabled ? (
              <span className="text-emerald-400">ENABLED (Voluntary)</span>
            ) : (
              <span className="text-slate-400">DISABLED</span>
            )}
          </div>
          <div className="text-[10px] text-[#8b949e] mt-1">
            Slots: {capabilities?.activeRelays ?? 0}/{capabilities?.maxRelaySlots ?? DEFAULT_RESOURCE_BUDGET.maxRelaySlots} &bull; {DEFAULT_RESOURCE_BUDGET.networkBudgetKbps} Kbps
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] p-2.5 rounded">
          <div className="text-[#8b949e] text-[10px] uppercase">Decentralized Mesh Scope</div>
          <div className="font-bold text-white mt-0.5">
            {members.length} Discovered Node(s)
          </div>
          <div className="text-[10px] text-[#8b949e] mt-1 truncate" title={activeUrl}>
            Mode: {networkMode === "global" ? "Global Cluster" : activeUrl}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Discovered Cluster Nodes Table (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded overflow-hidden">
            <div className="bg-[#21262d] px-3 py-2 border-b border-[#30363d] flex items-center justify-between">
              <span className="font-bold text-white text-xs flex items-center gap-2">
                <span>ALL DISCOVERED CLIENTS IN CLUSTER ({members.length})</span>
              </span>
              <span className="text-[#8b949e] text-[10px]">
                Real-Time ECDSA Signed Heartbeats
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#0d1117] text-[#8b949e] border-b border-[#30363d]">
                  <tr>
                    <th className="p-2">Client / Node ID</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Heartbeat</th>
                    <th className="p-2">Ping</th>
                    <th className="p-2">Relay Slots</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {members.map((node) => {
                    const isSelf = node.nodeId === nodeId;
                    const nodeRole = roles.get(node.nodeId) || node.role || (isSelf ? selfRole : "participant");
                    const elapsed = Math.max(0, Math.round((now - node.lastSeen) / 1000));

                    return (
                      <tr
                        key={node.nodeId}
                        className={`hover:bg-[#21262d]/50 ${isSelf ? "bg-[#1f6feb]/10 font-semibold" : ""}`}
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#58a6ff]">{node.nodeId.slice(0, 14)}...</span>
                            {isSelf && (
                              <span className="px-1 bg-[#1f6feb] text-white text-[9px] rounded font-bold">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#8b949e] font-mono">{node.peerId}</div>
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                              nodeRole === "coordinator"
                                ? "bg-amber-900/40 text-amber-300 border border-amber-700/50"
                                : nodeRole === "relay"
                                ? "bg-blue-900/40 text-blue-300 border border-blue-700/50"
                                : nodeRole === "standby"
                                ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {nodeRole}
                          </span>
                        </td>
                        <td className="p-2">
                          {node.status === "online" ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> online
                            </span>
                          ) : node.status === "suspected" ? (
                            <span className="text-amber-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> suspected
                            </span>
                          ) : (
                            <span className="text-rose-400">offline</span>
                          )}
                        </td>
                        <td className="p-2 text-[#8b949e]">#{node.sequence}</td>
                        <td className="p-2 text-[#8b949e]">{isSelf ? "0s (local)" : `${elapsed}s ago`}</td>
                        <td className="p-2">
                          {node.contributionEnabled ? (
                            <span className="text-emerald-400 font-semibold">
                              {node.capabilities?.availableRelaySlots ?? 2}/{node.capabilities?.maxRelaySlots ?? 2}
                            </span>
                          ) : (
                            <span className="text-[#8b949e]">off</span>
                          )}
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() => copyToClipboard(node.nodeId)}
                            className="px-1.5 py-0.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-[#c9d1d9]"
                          >
                            Copy ID
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Media Routing Streams Matrix */}
          <div className="bg-[#161b22] border border-[#30363d] rounded overflow-hidden">
            <div className="bg-[#21262d] px-3 py-2 border-b border-[#30363d] flex items-center justify-between">
              <span className="font-bold text-white text-xs">
                MEDIA ROUTING & STREAM FORWARDING MATRIX ({routingPlan?.routes.size ?? 0})
              </span>
              <span className="text-[#8b949e] text-[10px]">
                Adaptive Direct / Relay Topology
              </span>
            </div>

            <div className="p-3">
              {!routingPlan || routingPlan.routes.size === 0 ? (
                <div className="text-center py-4 text-[#8b949e] text-xs">
                  Zero active media streams. Speaking in any connected tab activates live loop-free routes.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#0d1117] text-[#8b949e]">
                      <tr>
                        <th className="p-2">Speaker</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Forwarding Traversal Path</th>
                        <th className="p-2">Listener</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363d]">
                      {Array.from(routingPlan.routes.values()).map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-[#58a6ff]">{r.speakerNodeId.slice(0, 12)}...</td>
                          <td className="p-2">
                            <span className={r.routeType === "relay" ? "text-blue-400 font-bold" : "text-emerald-400"}>
                              {r.routeType.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-2 text-[#8b949e]">
                            {r.path.map((id, pIdx) => (
                              <span key={pIdx}>
                                <span className={id === r.relayNodeId ? "text-blue-300 font-bold" : ""}>
                                  {id.slice(0, 10)}...
                                </span>
                                {pIdx < r.path.length - 1 && <span className="mx-1">➔</span>}
                              </span>
                            ))}
                          </td>
                          <td className="p-2 text-[#c9d1d9]">{r.listenerNodeId.slice(0, 12)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Event / Packet Stream (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded flex flex-col h-[520px]">
            <div className="bg-[#21262d] px-3 py-2 border-b border-[#30363d] flex items-center justify-between">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE PACKET & EVENT STREAM
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-[#8b949e] hover:text-[#c9d1d9]"
              >
                Clear Log
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1.5 bg-[#0d1117]">
              {logs.length === 0 ? (
                <div className="text-[#8b949e] py-8 text-center">
                  Waiting for incoming/outgoing packet events...
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="leading-tight flex items-start gap-1.5">
                    <span className="text-[#8b949e] shrink-0">[{log.time}]</span>
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                        log.type === "IN"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : log.type === "OUT"
                          ? "bg-blue-950 text-blue-400 border border-blue-800"
                          : log.type === "ROLE"
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : log.type === "ROUTE"
                          ? "bg-purple-950 text-purple-300 border border-purple-800"
                          : "bg-slate-900 text-slate-400"
                      }`}
                    >
                      {log.type}
                    </span>
                    <span className="text-[#c9d1d9] break-all">{log.summary}</span>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Raw JSON State Modal / View */}
      {showJsonState && (
        <div className="mt-4 bg-[#161b22] border border-[#30363d] rounded p-3">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#30363d]">
            <span className="font-bold text-white text-xs">RAW CLUSTER STATE JSON</span>
            <button
              onClick={() => copyToClipboard(JSON.stringify({ nodeId, selfRole, members, roles: Object.fromEntries(roles), routingPlan }, null, 2))}
              className="px-2 py-0.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[10px] text-[#c9d1d9]"
            >
              Copy JSON
            </button>
          </div>
          <pre className="text-[10px] text-emerald-400 bg-[#0d1117] p-3 rounded overflow-x-auto max-h-80">
            {JSON.stringify(
              {
                localNode: {
                  nodeId,
                  selfRole,
                  contributionEnabled,
                  capabilities,
                },
                cluster: {
                  room: room?.roomId,
                  meshUrl: activeUrl,
                  onlineCount: members.length,
                  coordinator: coordinatorNodeId,
                  members,
                  roles: Object.fromEntries(roles.entries()),
                },
                routing: routingPlan
                  ? {
                      directCount: routingPlan.directRouteCount,
                      relayCount: routingPlan.relayRouteCount,
                      routes: Array.from(routingPlan.routes.entries()),
                    }
                  : null,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
};

export default OptionsApp;
