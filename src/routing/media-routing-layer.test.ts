import { describe, expect, it } from "vitest";
import { NetworkNode } from "../membership/membership-store";
import { MediaRoutingLayer } from "./media-routing-layer";

describe("MediaRoutingLayer & Dynamic Relay Overlay (WebRoom v3 Phase 5)", () => {
  const speakerNode: NetworkNode = {
    nodeId: "node_speaker_111122223333444455556666",
    peerId: "peer_speaker",
    publicKey: "pubSpeaker",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: true,
  };

  const listenerNode1: NetworkNode = {
    nodeId: "node_listener_111122223333444455556666",
    peerId: "peer_listener_1",
    publicKey: "pubListener1",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: false,
  };

  const listenerNode2: NetworkNode = {
    nodeId: "node_listener_222233334444555566667777",
    peerId: "peer_listener_2",
    publicKey: "pubListener2",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: false,
  };

  const relayNode: NetworkNode = {
    nodeId: "node_relay_333344445555666677778888",
    peerId: "peer_relay",
    publicKey: "pubRelay",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: true,
    capabilities: {
      contributionEnabled: true,
      maxRelaySlots: 2,
      activeRelays: 0,
      availableRelaySlots: 2,
      networkBudgetKbps: 500,
      currentBandwidthKbps: 0,
    },
  };

  const listenerNode3: NetworkNode = {
    nodeId: "node_listener_444455556666777788889999",
    peerId: "peer_listener_3",
    publicKey: "pubListener3",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: false,
  };

  it("uses direct P2P routing for small rooms (<= 3 nodes)", () => {
    const layer = new MediaRoutingLayer();
    const members = [speakerNode, listenerNode1, listenerNode2];
    const activeSpeakers = new Set([speakerNode.nodeId]);

    const plan = layer.computeRoutingPlan(members, activeSpeakers);

    expect(plan.directRouteCount).toBe(2);
    expect(plan.relayRouteCount).toBe(0);

    const route1 = plan.routes.get(`${speakerNode.nodeId}->${listenerNode1.nodeId}`);
    expect(route1).toBeDefined();
    expect(route1!.routeType).toBe("direct");
    expect(route1!.path).toEqual([speakerNode.nodeId, listenerNode1.nodeId]);
  });

  it("selects bounded relay routes when group size > 3 and contributors are available", () => {
    const layer = new MediaRoutingLayer();
    const members = [speakerNode, relayNode, listenerNode1, listenerNode2];
    const activeSpeakers = new Set([speakerNode.nodeId]);

    const plan = layer.computeRoutingPlan(members, activeSpeakers);

    // Relay node has capacity for 2 streams, so listener 1 and listener 2 are relayed
    expect(plan.relayRouteCount).toBe(2);

    const relayedRoute = plan.routes.get(`${speakerNode.nodeId}->${listenerNode1.nodeId}`);
    expect(relayedRoute).toBeDefined();
    expect(relayedRoute!.routeType).toBe("relay");
    expect(relayedRoute!.relayNodeId).toBe(relayNode.nodeId);
    expect(relayedRoute!.path).toEqual([speakerNode.nodeId, relayNode.nodeId, listenerNode1.nodeId]);
  });

  it("enforces bounded capacity limit and falls back to direct route when relay slots are exhausted", () => {
    const layer = new MediaRoutingLayer();
    // 4 listeners + 1 speaker + 1 relay (max 2 slots)
    const members = [speakerNode, relayNode, listenerNode1, listenerNode2, listenerNode3];
    const activeSpeakers = new Set([speakerNode.nodeId]);

    const plan = layer.computeRoutingPlan(members, activeSpeakers);

    // Max 2 relayed streams, remaining listener (and relay itself) get direct routes
    expect(plan.relayRouteCount).toBe(2);
    expect(plan.directRouteCount).toBe(2);
  });

  it("detects and prevents routing loops", () => {
    const layer = new MediaRoutingLayer();
    expect(layer.hasDuplicateNodes(["nodeA", "nodeB", "nodeC"])).toBe(false);
    expect(layer.hasDuplicateNodes(["nodeA", "nodeB", "nodeA"])).toBe(true); // Loop detected
  });

  it("dynamically reassigns routes on relay node failure", () => {
    const layer = new MediaRoutingLayer();
    const members = [speakerNode, relayNode, listenerNode1, listenerNode2];
    const activeSpeakers = new Set([speakerNode.nodeId]);

    // Initial relayed plan
    const initialPlan = layer.computeRoutingPlan(members, activeSpeakers);
    expect(initialPlan.relayRouteCount).toBe(2);

    // Relay node fails
    const failedMembers = [speakerNode, { ...relayNode, status: "offline" as const }, listenerNode1, listenerNode2];
    const recoveredPlan = layer.handleNodeFailure(relayNode.nodeId, failedMembers, activeSpeakers);

    // Fall back to direct routes
    expect(recoveredPlan.relayRouteCount).toBe(0);
    expect(recoveredPlan.directRouteCount).toBe(2);
  });
});
