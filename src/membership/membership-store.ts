import { NodeCapabilities } from "../resources/resource-budget";
import { NodeLivenessStatus } from "./membership-protocol";

/**
 * WebRoom v3 — In-Memory Network Node Model & State Store
 */

export interface NetworkNode {
  nodeId: string;
  peerId: string;
  publicKey: string;
  lastSeen: number;
  sequence: number;
  status: NodeLivenessStatus;
  contributionEnabled: boolean;
  capabilities?: NodeCapabilities;
  avatar?: string;
}

export interface LivenessEvaluationResult {
  newlySuspected: NetworkNode[];
  newlyOffline: NetworkNode[];
}

export class MembershipStore {
  private readonly nodesByNodeId = new Map<string, NetworkNode>();
  private readonly nodeIdByPeerId = new Map<string, string>();

  /**
   * Updates or inserts a NetworkNode record.
   * Handles peer reloads, sequence restarts, and status recovery.
   */
  public upsertNode(node: NetworkNode): { isNew: boolean; wasSuspected: boolean } {
    const existing = this.nodesByNodeId.get(node.nodeId);
    const isNew = !existing;
    const wasSuspected = Boolean(existing && existing.status === "suspected");

    // If the same peer session sends an older or duplicate sequence, refresh lastSeen but skip state mutation
    if (existing && existing.peerId === node.peerId && node.sequence < existing.sequence) {
      existing.lastSeen = Math.max(existing.lastSeen, node.lastSeen);
      return { isNew: false, wasSuspected: false };
    }

    const updatedNode: NetworkNode = {
      ...node,
      lastSeen: node.lastSeen > 0 ? node.lastSeen : Date.now(),
      status: "online", // Fresh valid message restores node to online
      avatar: node.avatar || existing?.avatar,
    };

    this.nodesByNodeId.set(node.nodeId, updatedNode);
    this.nodeIdByPeerId.set(node.peerId, node.nodeId);

    return { isNew, wasSuspected };
  }

  /**
   * Retrieves a node record by its cryptographic nodeId.
   */
  public getNode(nodeId: string): NetworkNode | undefined {
    return this.nodesByNodeId.get(nodeId);
  }

  /**
   * Retrieves a node record by its transport peerId.
   */
  public getNodeByPeerId(peerId: string): NetworkNode | undefined {
    const nodeId = this.nodeIdByPeerId.get(peerId);
    if (!nodeId) return undefined;
    return this.nodesByNodeId.get(nodeId);
  }

  /**
   * Removes a node explicitly upon graceful goodbye or manual eviction.
   */
  public removeNode(nodeId: string): NetworkNode | null {
    const node = this.nodesByNodeId.get(nodeId);
    if (!node) return null;

    this.nodesByNodeId.delete(nodeId);
    this.nodeIdByPeerId.delete(node.peerId);
    return node;
  }

  /**
   * Evaluates liveness of all tracked nodes against suspected and offline thresholds.
   * Progressively transitions nodes: online -> suspected -> offline.
   */
  public evaluateLiveness(
    suspectedThresholdMs: number,
    offlineThresholdMs: number,
    now: number = Date.now()
  ): LivenessEvaluationResult {
    const newlySuspected: NetworkNode[] = [];
    const newlyOffline: NetworkNode[] = [];

    for (const [nodeId, node] of this.nodesByNodeId.entries()) {
      const elapsed = now - node.lastSeen;

      if (elapsed > offlineThresholdMs) {
        // Node has exceeded offline threshold — evict from active membership
        this.nodesByNodeId.delete(nodeId);
        this.nodeIdByPeerId.delete(node.peerId);
        newlyOffline.push({ ...node, status: "offline" });
      } else if (elapsed > suspectedThresholdMs && node.status === "online") {
        // Node missed heartbeats — transition to suspected
        node.status = "suspected";
        newlySuspected.push({ ...node });
      }
    }

    return { newlySuspected, newlyOffline };
  }

  /**
   * Returns all active node records.
   */
  public getAllNodes(): NetworkNode[] {
    return Array.from(this.nodesByNodeId.values());
  }

  /**
   * Returns all nodes currently in 'online' state.
   */
  public getOnlineNodes(): NetworkNode[] {
    return this.getAllNodes().filter((n) => n.status === "online");
  }

  /**
   * Returns all nodes currently in 'suspected' state.
   */
  public getSuspectedNodes(): NetworkNode[] {
    return this.getAllNodes().filter((n) => n.status === "suspected");
  }

  /**
   * Total count of tracked nodes (online + suspected).
   */
  public getNodeCount(): number {
    return this.nodesByNodeId.size;
  }

  /**
   * Clears all membership records.
   */
  public clear(): void {
    this.nodesByNodeId.clear();
    this.nodeIdByPeerId.clear();
  }
}
