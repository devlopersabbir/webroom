import { NetworkNode } from "../membership/membership-store";
import { NodeRole, RoleChangeListener, RoleEvaluationResult } from "./role-types";

/**
 * WebRoom v3 — Distributed Role Manager & Deterministic Coordinator Election
 * 
 * Implements deterministic distributed coordination (Section 9):
 * same membership + same capabilities + same deterministic ranking = same decision
 */
export class RoleManager {
  private selfRole: NodeRole = "participant";
  private coordinatorNodeId: string | null = null;
  private readonly rolesByNodeId = new Map<string, NodeRole>();
  private readonly listeners = new Set<RoleChangeListener>();

  /**
   * Evaluates and updates dynamic roles for all connected nodes in the room.
   * 
   * WHY DETERMINISTIC:
   * By sorting nodes with a deterministic comparator based on liveness, contribution
   * status, capacity heuristics, and lexicographical tie-breakers, all nodes reach
   * identical role assignments independently without running costly consensus protocols.
   */
  public evaluateRoles(allNodes: NetworkNode[], selfNodeId: string): RoleEvaluationResult {
    const roleAssignments = new Map<string, NodeRole>();
    const previousSelfRole = this.selfRole;

    // Filter online nodes
    const onlineNodes = allNodes.filter((n) => n.status === "online");

    if (onlineNodes.length === 0) {
      this.selfRole = "participant";
      this.coordinatorNodeId = null;
      this.rolesByNodeId.clear();
      return {
        selfRole: "participant",
        coordinatorNodeId: null,
        roleAssignments,
      };
    }

    // Sort nodes deterministically for role candidate ranking
    const rankedCandidates = [...onlineNodes].sort((a, b) => {
      // 1. Voluntary contributors come first
      if (a.contributionEnabled !== b.contributionEnabled) {
        return a.contributionEnabled ? -1 : 1;
      }

      // 2. Nodes with higher available relay capacity come next
      const aSlots = a.capabilities?.availableRelaySlots ?? 0;
      const bSlots = b.capabilities?.availableRelaySlots ?? 0;
      if (aSlots !== bSlots) {
        return bSlots - aSlots;
      }

      // 3. Deterministic cryptographic tie-breaker
      return a.nodeId.localeCompare(b.nodeId);
    });

    // Check if incumbent coordinator is still online and contributing (Sticky Role Protocol)
    let electedCoordinator: NetworkNode;
    const incumbentCoordinator = this.coordinatorNodeId
      ? onlineNodes.find(
          (n) => n.nodeId === this.coordinatorNodeId && n.contributionEnabled
        )
      : null;

    if (incumbentCoordinator) {
      // Incumbent coordinator retains role across tab reloads and peer joins
      electedCoordinator = incumbentCoordinator;
    } else {
      // Re-elect highest-ranking eligible candidate
      electedCoordinator = rankedCandidates[0];
    }

    const previousCoordinator = this.coordinatorNodeId;
    this.coordinatorNodeId = electedCoordinator.nodeId;

    // Assign roles to each node
    for (const node of allNodes) {
      let role: NodeRole;

      if (node.status !== "online") {
        // Suspected or offline nodes are demoted to regular participant
        role = "participant";
      } else if (node.nodeId === electedCoordinator.nodeId) {
        role = "coordinator";
      } else if (!node.contributionEnabled) {
        role = "participant";
      } else if ((node.capabilities?.activeRelays ?? 0) > 0) {
        // Active relay forwarding media to downstream peers
        role = "relay";
      } else {
        // Contributor ready in standby pool
        role = "standby";
      }

      roleAssignments.set(node.nodeId, role);
    }

    this.rolesByNodeId.clear();
    for (const [nodeId, role] of roleAssignments.entries()) {
      this.rolesByNodeId.set(nodeId, role);
    }

    this.selfRole = roleAssignments.get(selfNodeId) || "participant";

    if (this.selfRole !== previousSelfRole || previousCoordinator !== this.coordinatorNodeId) {
      console.log(
        `[WebRoom Roles] 👑 Role: ${this.selfRole.toUpperCase()} (Coordinator: ${this.coordinatorNodeId})`
      );
    }

    this.notifyListeners();

    return {
      selfRole: this.selfRole,
      coordinatorNodeId: this.coordinatorNodeId,
      roleAssignments,
    };
  }

  /**
   * Returns current role of this local node.
   */
  public getSelfRole(): NodeRole {
    return this.selfRole;
  }

  /**
   * Returns whether this local node is currently elected cluster coordinator.
   */
  public isCoordinator(): boolean {
    return this.selfRole === "coordinator";
  }

  /**
   * Returns current elected coordinator node ID (or null if none).
   */
  public getCoordinatorNodeId(): string | null {
    return this.coordinatorNodeId;
  }

  /**
   * Returns the computed role for any given node ID.
   */
  public getNodeRole(nodeId: string): NodeRole {
    return this.rolesByNodeId.get(nodeId) || "participant";
  }

  /**
   * Returns current snapshot map of all node roles.
   */
  public getAllRoles(): Map<string, NodeRole> {
    return new Map(this.rolesByNodeId);
  }

  /**
   * Subscribes to role change updates.
   */
  public onRoleChange(listener: RoleChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.selfRole, this.getAllRoles());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const all = this.getAllRoles();
    for (const listener of this.listeners) {
      try {
        listener(this.selfRole, all);
      } catch (err) {
        console.error("[WebRoom Roles] Error in role change listener:", err);
      }
    }
  }
}
