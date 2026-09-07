/**
 * WebRoom v3 Media Routing Layer Types & Interfaces
 * 
 * Defines routing abstractions for P2P direct and bounded peer relay overlays.
 * Conforms to Sections 12-16 of v3-architecture.md.
 */

export type RouteType = "direct" | "relay";

/**
 * Individual media transmission route between a publisher (speaker) and a subscriber (listener).
 */
export interface MediaRoute {
  /** Peer ID of the speaking node producing audio */
  speakerPeerId: string;
  /** Node ID of the speaking node */
  speakerNodeId: string;
  /** Peer ID of the listening subscriber node */
  listenerPeerId: string;
  /** Node ID of the listening subscriber node */
  listenerNodeId: string;
  /** Route topology type (direct P2P or multi-hop relay) */
  routeType: RouteType;
  /** If routeType is 'relay', the intermediate forwarding relay node ID */
  relayNodeId?: string;
  /** If routeType is 'relay', the intermediate forwarding relay peer ID */
  relayPeerId?: string;
  /** Traversal path of node IDs to enforce loop prevention (e.g. [speakerNodeId, relayNodeId, listenerNodeId]) */
  path: string[];
  /** Estimated latency in milliseconds (optional telemetry) */
  estimatedLatencyMs?: number;
}

/**
 * Active cluster-wide routing plan computed deterministically.
 */
export interface RoutingPlan {
  /** Timestamp when plan was computed */
  timestamp: number;
  /** Map of key `${speakerNodeId}->${listenerNodeId}` to MediaRoute */
  routes: Map<string, MediaRoute>;
  /** Total count of direct routes */
  directRouteCount: number;
  /** Total count of relayed routes */
  relayRouteCount: number;
  /** Active relays used in this plan mapped to the number of forwarding streams they handle */
  relayUtilization: Map<string, number>;
}

/**
 * Listener for routing plan updates.
 */
export type RoutingPlanListener = (plan: RoutingPlan) => void;
