import { describe, expect, it } from "vitest";
import { NetworkNode } from "../membership/membership-store";
import { RoleManager } from "./role-manager";

describe("RoleManager & Deterministic Coordination (WebRoom v3 Phase 4)", () => {
  const nodeA: NetworkNode = {
    nodeId: "node_aaaa1111222233334444555566667777",
    peerId: "peer_A",
    publicKey: "pubA",
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

  const nodeB: NetworkNode = {
    nodeId: "node_bbbb1111222233334444555566667777",
    peerId: "peer_B",
    publicKey: "pubB",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: true,
    capabilities: {
      contributionEnabled: true,
      maxRelaySlots: 2,
      activeRelays: 1,
      availableRelaySlots: 1,
      networkBudgetKbps: 500,
      currentBandwidthKbps: 50,
    },
  };

  const nodeC: NetworkNode = {
    nodeId: "node_cccc1111222233334444555566667777",
    peerId: "peer_C",
    publicKey: "pubC",
    lastSeen: Date.now(),
    sequence: 1,
    status: "online",
    contributionEnabled: false, // Non-contributor
  };

  it("deterministically elects coordinator based on contribution and capacity", () => {
    const roleManager = new RoleManager();
    const result = roleManager.evaluateRoles([nodeA, nodeB, nodeC], nodeA.nodeId);

    // Node A has more available slots (2 vs 1) than Node B -> Node A elected coordinator
    expect(result.coordinatorNodeId).toBe(nodeA.nodeId);
    expect(result.selfRole).toBe("coordinator");
    expect(result.roleAssignments.get(nodeA.nodeId)).toBe("coordinator");

    // Node B is active relay
    expect(result.roleAssignments.get(nodeB.nodeId)).toBe("relay");

    // Node C is non-contributor participant
    expect(result.roleAssignments.get(nodeC.nodeId)).toBe("participant");
  });

  it("assigns standby role to idle contributors", () => {
    const roleManager = new RoleManager();
    const nodeBIdle: NetworkNode = {
      ...nodeB,
      capabilities: { ...nodeB.capabilities!, activeRelays: 0, availableRelaySlots: 2 },
    };

    const result = roleManager.evaluateRoles([nodeA, nodeBIdle], nodeBIdle.nodeId);
    expect(result.coordinatorNodeId).toBe(nodeA.nodeId); // Node A wins tie-breaker lexicographically
    expect(result.selfRole).toBe("standby");
    expect(result.roleAssignments.get(nodeBIdle.nodeId)).toBe("standby");
  });

  it("automatically fails over and promotes next candidate when coordinator disconnects", () => {
    const roleManager = new RoleManager();

    // Node A is coordinator
    roleManager.evaluateRoles([nodeA, nodeB], nodeB.nodeId);
    expect(roleManager.getCoordinatorNodeId()).toBe(nodeA.nodeId);
    expect(roleManager.getSelfRole()).toBe("relay");

    // Node A goes suspected/offline
    const nodeAFailed: NetworkNode = { ...nodeA, status: "suspected" };
    const failoverResult = roleManager.evaluateRoles([nodeAFailed, nodeB], nodeB.nodeId);

    // Node B is immediately promoted to coordinator
    expect(failoverResult.coordinatorNodeId).toBe(nodeB.nodeId);
    expect(failoverResult.selfRole).toBe("coordinator");
    expect(failoverResult.roleAssignments.get(nodeAFailed.nodeId)).toBe("participant");
  });

  it("notifies listeners on role changes", () => {
    const roleManager = new RoleManager();
    const receivedRoles: string[] = [];

    roleManager.onRoleChange((selfRole) => {
      receivedRoles.push(selfRole);
    });

    roleManager.evaluateRoles([nodeA, nodeB], nodeA.nodeId);
    roleManager.evaluateRoles([{ ...nodeA, status: "offline" }, nodeB], nodeA.nodeId);

    expect(receivedRoles).toContain("coordinator");
    expect(receivedRoles).toContain("participant");
  });

  it("preserves incumbent coordinator across new node joins and tab reloads (Sticky Role Protocol)", () => {
    const roleManager = new RoleManager();

    // Node B is initial coordinator in the room
    const initResult = roleManager.evaluateRoles([nodeB], nodeB.nodeId);
    expect(initResult.coordinatorNodeId).toBe(nodeB.nodeId);
    expect(initResult.selfRole).toBe("coordinator");

    // Node A (which has more available slots and lower hash) joins
    // Node B MUST remain coordinator due to incumbent stickiness
    const stickyResult = roleManager.evaluateRoles([nodeB, nodeA], nodeB.nodeId);
    expect(stickyResult.coordinatorNodeId).toBe(nodeB.nodeId);
    expect(stickyResult.selfRole).toBe("coordinator");
    expect(stickyResult.roleAssignments.get(nodeA.nodeId)).toBe("standby");

    // When Node B goes offline, Node A promotes to coordinator
    const failoverResult = roleManager.evaluateRoles([{ ...nodeB, status: "offline" }, nodeA], nodeA.nodeId);
    expect(failoverResult.coordinatorNodeId).toBe(nodeA.nodeId);
    expect(failoverResult.selfRole).toBe("coordinator");
  });
});
