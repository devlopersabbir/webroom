import { NetworkNode } from "../membership/membership-store";
import { MediaRoute, RoutingPlan, RoutingPlanListener } from "./routing-types";

/** Maximum group size before dynamic relay routing is considered */
export const DIRECT_MESH_MAX_SIZE = 3;

/**
 * MediaRoutingLayer
 *
 * Manages dynamic voice and media routing across peers in a WebRoom room.
 * Implements Sections 12-16 of v3-architecture.md.
 *
 * Responsibilities:
 * 1. Computes optimal routes (Direct P2P vs Bounded Relay).
 * 2. Enforces loop prevention and relay capacity constraints.
 * 3. Handles automatic route reconstruction upon node failure/departure.
 */
export class MediaRoutingLayer {
  private currentPlan: RoutingPlan;
  private readonly listeners: Set<RoutingPlanListener> = new Set();

  constructor() {
    this.currentPlan = {
      timestamp: Date.now(),
      routes: new Map(),
      directRouteCount: 0,
      relayRouteCount: 0,
      relayUtilization: new Map(),
    };
  }

  /**
   * Returns current active routing plan.
   */
  public getRoutingPlan(): RoutingPlan {
    return this.currentPlan;
  }

  /**
   * Subscribes to routing plan changes.
   */
  public onRouteChange(listener: RoutingPlanListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Computes an optimal, loop-free routing plan for all active speakers and listeners.
   *
   * @param members All known network nodes with status and capabilities.
   * @param activeSpeakerNodeIds Set of nodeIds currently speaking/publishing audio.
   * @returns Newly computed RoutingPlan.
   */
  public computeRoutingPlan(
    members: NetworkNode[],
    activeSpeakerNodeIds: Set<string>,
  ): RoutingPlan {
    const routes = new Map<string, MediaRoute>();
    const relayUtilization = new Map<string, number>();
    let directCount = 0;
    let relayCount = 0;

    const onlineMembers = members.filter((m) => m.status === "online");

    // If room is small (<= 3 online members), use pure Direct P2P for maximum simplicity and zero relay hops
    const isSmallMesh = onlineMembers.length <= DIRECT_MESH_MAX_SIZE;

    // Available relay candidates (online contributors)
    const relayCandidates = onlineMembers
      .filter((m) => m.contributionEnabled)
      .sort((a, b) => {
        // Rank by available relay slots descending, then deterministic tie-breaker
        const aSlots = a.capabilities?.availableRelaySlots ?? 0;
        const bSlots = b.capabilities?.availableRelaySlots ?? 0;
        if (aSlots !== bSlots) {
          return bSlots - aSlots;
        }
        return a.nodeId.localeCompare(b.nodeId);
      });

    for (const speakerNodeId of activeSpeakerNodeIds) {
      const speaker = onlineMembers.find((m) => m.nodeId === speakerNodeId);
      if (!speaker) continue;

      for (const listener of onlineMembers) {
        if (listener.nodeId === speakerNodeId) continue;

        const routeKey = `${speakerNodeId}->${listener.nodeId}`;

        if (isSmallMesh) {
          // Direct P2P Route
          const directRoute: MediaRoute = {
            speakerPeerId: speaker.peerId,
            speakerNodeId: speaker.nodeId,
            listenerPeerId: listener.peerId,
            listenerNodeId: listener.nodeId,
            routeType: "direct",
            path: [speaker.nodeId, listener.nodeId],
          };
          routes.set(routeKey, directRoute);
          directCount++;
        } else {
          // Check for eligible relay candidate
          const selectedRelay = this.selectRelayForStream(
            speaker,
            listener,
            relayCandidates,
            relayUtilization,
          );

          if (selectedRelay) {
            const relayRoute: MediaRoute = {
              speakerPeerId: speaker.peerId,
              speakerNodeId: speaker.nodeId,
              listenerPeerId: listener.peerId,
              listenerNodeId: listener.nodeId,
              routeType: "relay",
              relayNodeId: selectedRelay.nodeId,
              relayPeerId: selectedRelay.peerId,
              path: [speaker.nodeId, selectedRelay.nodeId, listener.nodeId],
            };
            routes.set(routeKey, relayRoute);
            relayCount++;

            console.log(
              `[WebRoom Routing] ⚡ Stream routed: ${speaker.nodeId.slice(0, 14)}... ➔ [Relay: ${selectedRelay.nodeId.slice(0, 14)}...] ➔ ${listener.nodeId.slice(0, 14)}...`,
            );

            const currentUtil = relayUtilization.get(selectedRelay.nodeId) || 0;
            relayUtilization.set(selectedRelay.nodeId, currentUtil + 1);
          } else {
            // Fallback to direct P2P if no relay has capacity
            const fallbackDirect: MediaRoute = {
              speakerPeerId: speaker.peerId,
              speakerNodeId: speaker.nodeId,
              listenerPeerId: listener.peerId,
              listenerNodeId: listener.nodeId,
              routeType: "direct",
              path: [speaker.nodeId, listener.nodeId],
            };
            routes.set(routeKey, fallbackDirect);
            directCount++;
          }
        }
      }
    }

    if (routes.size > 0) {
      console.log(
        `[WebRoom Routing] 🗺️ Routing plan: ${directCount} direct, ${relayCount} relayed streams (${onlineMembers.length} nodes online)`,
      );
    }

    const newPlan: RoutingPlan = {
      timestamp: Date.now(),
      routes,
      directRouteCount: directCount,
      relayRouteCount: relayCount,
      relayUtilization,
    };

    this.currentPlan = newPlan;
    this.notifyListeners(newPlan);
    return newPlan;
  }

  /**
   * Selects the best eligible relay for a speaker-listener pair, respecting capacity and loop prevention.
   */
  private selectRelayForStream(
    speaker: NetworkNode,
    listener: NetworkNode,
    candidates: NetworkNode[],
    currentUtilization: Map<string, number>,
  ): NetworkNode | null {
    for (const candidate of candidates) {
      // Relay cannot be the speaker itself or the listener
      if (
        candidate.nodeId === speaker.nodeId ||
        candidate.nodeId === listener.nodeId
      ) {
        continue;
      }

      // Check max slots limit
      const maxSlots = candidate.capabilities?.maxRelaySlots ?? 2;
      const inUse = currentUtilization.get(candidate.nodeId) || 0;
      if (inUse >= maxSlots) {
        continue;
      }

      // Loop prevention check: Verify path [speaker, candidate, listener] has no duplicates
      const proposedPath = [speaker.nodeId, candidate.nodeId, listener.nodeId];
      if (this.hasDuplicateNodes(proposedPath)) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  /**
   * Validates whether a proposed routing path contains cyclic loops.
   */
  public hasDuplicateNodes(path: string[]): boolean {
    const seen = new Set<string>();
    for (const id of path) {
      if (seen.has(id)) {
        return true; // Cycle detected
      }
      seen.add(id);
    }
    return false;
  }

  /**
   * Reconstructs routes when a relay node fails or disconnects.
   * Evicts affected routes and falls back smoothly to direct routes or available standby relays.
   */
  public handleNodeFailure(
    failedNodeId: string,
    allMembers: NetworkNode[],
    activeSpeakers: Set<string>,
  ): RoutingPlan {
    console.log(
      `[WebRoom Routing] 🔄 Reconstructing routes after node departure (${failedNodeId.slice(0, 14)}...)`,
    );
    return this.computeRoutingPlan(allMembers, activeSpeakers);
  }

  private notifyListeners(plan: RoutingPlan): void {
    for (const listener of this.listeners) {
      try {
        listener(plan);
      } catch (err) {
        console.warn("[WebRoom Routing] Error in route change listener:", err);
      }
    }
  }

  /**
   * Releases listeners.
   */
  public destroy(): void {
    this.listeners.clear();
  }
}
