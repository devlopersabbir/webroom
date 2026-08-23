import { describe, expect, it } from "vitest";
import { MemoryIdentityStorage } from "../identity/identity-store";
import { NodeIdentity } from "../identity/node-identity";
import { WebRoomMessage } from "../presence/protocol";
import { MessageHandler, Transport } from "../transport/transport";
import {
  MembershipManager,
} from "./membership-manager";
import {
  getMembershipSignaturePayload,
  isValidMembershipMessage,
  MembershipMessage,
  verifyMembershipMessageSignature,
} from "./membership-protocol";
import { MembershipStore, NetworkNode } from "./membership-store";

class MockTransport implements Transport {
  public messages: WebRoomMessage[] = [];
  private listeners = new Set<MessageHandler>();
  public started = false;
  public closed = false;

  public send(msg: WebRoomMessage): void {
    this.messages.push(msg);
  }

  public onMessage(listener: MessageHandler): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public start(): void {
    this.started = true;
  }

  public close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  public simulateIncoming(msg: WebRoomMessage): void {
    for (const listener of this.listeners) {
      listener(msg);
    }
  }
}

describe("Membership Protocol & Message Verification (WebRoom v3 Phase 2)", () => {
  it("validates and generates a verifiable membership message signature", async () => {
    const identity = await NodeIdentity.initialize(new MemoryIdentityStorage());
    const unsignedPayload = {
      type: "NODE_ANNOUNCE" as const,
      roomId: "room_alpha",
      nodeId: identity.getNodeId(),
      peerId: "peer_1",
      timestamp: Date.now(),
      sequence: 1,
      status: "online" as const,
      contributionEnabled: true,
    };

    const canonical = getMembershipSignaturePayload(unsignedPayload);
    const signature = await identity.sign(canonical);

    const msg: MembershipMessage = {
      ...unsignedPayload,
      publicKey: identity.getPublicKey(),
      signature,
      avatar: "🐸",
    };

    expect(isValidMembershipMessage(msg, "room_alpha")).toBe(true);
    const isVerified = await verifyMembershipMessageSignature(msg);
    expect(isVerified).toBe(true);
  });

  it("rejects tampered membership messages", async () => {
    const identity = await NodeIdentity.initialize(new MemoryIdentityStorage());
    const unsignedPayload = {
      type: "NODE_HEARTBEAT" as const,
      roomId: "room_alpha",
      nodeId: identity.getNodeId(),
      peerId: "peer_1",
      timestamp: Date.now(),
      sequence: 1,
      status: "online" as const,
      contributionEnabled: true,
    };

    const canonical = getMembershipSignaturePayload(unsignedPayload);
    const signature = await identity.sign(canonical);

    const tamperedMsg: MembershipMessage = {
      ...unsignedPayload,
      roomId: "room_beta", // Altered roomId
      publicKey: identity.getPublicKey(),
      signature,
    };

    const isVerified = await verifyMembershipMessageSignature(tamperedMsg);
    expect(isVerified).toBe(false);
  });
});

describe("MembershipStore Liveness Tracking", () => {
  it("upserts nodes and tracks state transitions", () => {
    const store = new MembershipStore();
    const node: NetworkNode = {
      nodeId: "node_1234567890abcdef1234567890abcdef",
      peerId: "peer_test",
      publicKey: "pub_key_test",
      lastSeen: 1000,
      sequence: 1,
      status: "online",
      contributionEnabled: true,
      avatar: "🐸",
    };

    const { isNew } = store.upsertNode(node);
    expect(isNew).toBe(true);
    expect(store.getNodeCount()).toBe(1);

    // Evaluate liveness at t=7000 (elapsed=6000ms > 5000ms suspected threshold)
    const result1 = store.evaluateLiveness(5000, 10000, 7000);
    expect(result1.newlySuspected.length).toBe(1);
    expect(result1.newlySuspected[0].nodeId).toBe(node.nodeId);
    expect(store.getSuspectedNodes().length).toBe(1);

    // Node sends a new heartbeat at t=7500 -> transitions back to online
    const { wasSuspected } = store.upsertNode({
      ...node,
      sequence: 2,
      lastSeen: 7500,
    });
    expect(wasSuspected).toBe(true);
    expect(store.getOnlineNodes().length).toBe(1);
    expect(store.getSuspectedNodes().length).toBe(0);

    // Evaluate liveness at t=18000 (elapsed=10500ms > 10000ms offline threshold)
    const result2 = store.evaluateLiveness(5000, 10000, 18000);
    expect(result2.newlyOffline.length).toBe(1);
    expect(store.getNodeCount()).toBe(0);
  });
});

describe("MembershipManager Multi-Node Coordination", () => {
  it("discovers remote nodes and verifies signed heartbeats", async () => {
    const identityA = await NodeIdentity.initialize(new MemoryIdentityStorage());
    const identityB = await NodeIdentity.initialize(new MemoryIdentityStorage());

    const transportA = new MockTransport();
    const managerA = new MembershipManager("test_room", identityA, "peer_A", transportA, "🦊");
    managerA.start();

    const joinedNodes: NetworkNode[] = [];
    managerA.onNodeJoin((node) => joinedNodes.push(node));

    // Simulate Node B sending signed announcement
    const unsignedB = {
      type: "NODE_ANNOUNCE" as const,
      roomId: "test_room",
      nodeId: identityB.getNodeId(),
      peerId: "peer_B",
      timestamp: Date.now(),
      sequence: 1,
      status: "online" as const,
      contributionEnabled: true,
    };
    const signatureB = await identityB.sign(getMembershipSignaturePayload(unsignedB));

    transportA.simulateIncoming({
      ...unsignedB,
      publicKey: identityB.getPublicKey(),
      signature: signatureB,
      avatar: "🐼",
    });

    // Wait a tick for async verification
    await new Promise((r) => setTimeout(r, 20));

    expect(joinedNodes.length).toBe(1);
    expect(joinedNodes[0].nodeId).toBe(identityB.getNodeId());
    expect(managerA.getMemberCount()).toBe(2); // self + Node B

    await managerA.destroy();
  });

  it("handles graceful goodbye departures", async () => {
    const identityA = await NodeIdentity.initialize(new MemoryIdentityStorage());
    const identityB = await NodeIdentity.initialize(new MemoryIdentityStorage());

    const transportA = new MockTransport();
    const managerA = new MembershipManager("test_room", identityA, "peer_A", transportA);
    managerA.start();

    const leftNodes: NetworkNode[] = [];
    managerA.onNodeLeave((node) => leftNodes.push(node));

    // Join B
    const unsignedAnnounce = {
      type: "NODE_ANNOUNCE" as const,
      roomId: "test_room",
      nodeId: identityB.getNodeId(),
      peerId: "peer_B",
      timestamp: Date.now(),
      sequence: 1,
      status: "online" as const,
      contributionEnabled: true,
    };
    const sigAnnounce = await identityB.sign(getMembershipSignaturePayload(unsignedAnnounce));
    transportA.simulateIncoming({
      ...unsignedAnnounce,
      publicKey: identityB.getPublicKey(),
      signature: sigAnnounce,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(managerA.getMemberCount()).toBe(2);

    // Send Goodbye from B
    const unsignedGoodbye = {
      type: "NODE_GOODBYE" as const,
      roomId: "test_room",
      nodeId: identityB.getNodeId(),
      peerId: "peer_B",
      timestamp: Date.now(),
      sequence: 2,
      status: "online" as const,
      contributionEnabled: true,
    };
    const sigGoodbye = await identityB.sign(getMembershipSignaturePayload(unsignedGoodbye));
    transportA.simulateIncoming({
      ...unsignedGoodbye,
      publicKey: identityB.getPublicKey(),
      signature: sigGoodbye,
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(leftNodes.length).toBe(1);
    expect(leftNodes[0].nodeId).toBe(identityB.getNodeId());
    expect(managerA.getMemberCount()).toBe(1); // Only self left

    await managerA.destroy();
  });
});
