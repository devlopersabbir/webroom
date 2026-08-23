import { NodeIdentity } from "../identity/node-identity";
import { NodeCapabilities } from "../resources/resource-budget";
import { ResourceManager } from "../resources/resource-manager";
import {
  CLEANUP_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  NODE_TIMEOUT_MS,
  SUSPECTED_TIMEOUT_MS,
} from "../shared/constants";
import { Transport } from "../transport/transport";
import {
  getMembershipSignaturePayload,
  isValidMembershipMessage,
  MembershipMessage,
  verifyMembershipMessageSignature,
} from "./membership-protocol";
import { MembershipStore, NetworkNode } from "./membership-store";

export type MembershipNodeListener = (node: NetworkNode) => void;
export type MembershipListListener = (nodes: NetworkNode[]) => void;

/**
 * WebRoom v3 — Distributed Membership Manager
 * 
 * Coordinates cryptographic node presence, periodic signed heartbeats,
 * multi-stage failure detection (online -> suspected -> offline), and self-healing.
 */
export class MembershipManager {
  public readonly roomId: string;
  public readonly identity: NodeIdentity;
  public readonly peerId: string;
  public readonly avatar: string;
  public readonly resourceManager?: ResourceManager;

  private readonly transport: Transport;
  private readonly store: MembershipStore;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private unsubscribeResources: (() => void) | null = null;

  private sequenceNumber = 0;
  private isDestroyed = false;

  private readonly joinListeners = new Set<MembershipNodeListener>();
  private readonly suspectedListeners = new Set<MembershipNodeListener>();
  private readonly recoveredListeners = new Set<MembershipNodeListener>();
  private readonly leaveListeners = new Set<MembershipNodeListener>();
  private readonly changeListeners = new Set<MembershipListListener>();

  constructor(
    roomId: string,
    identity: NodeIdentity,
    peerId: string,
    transport: Transport,
    avatar: string = "🐸",
    resourceManager?: ResourceManager,
    store = new MembershipStore()
  ) {
    this.roomId = roomId;
    this.identity = identity;
    this.peerId = peerId;
    this.transport = transport;
    this.avatar = avatar;
    this.resourceManager = resourceManager;
    this.store = store;
  }

  public get contributionEnabled(): boolean {
    return this.resourceManager ? this.resourceManager.isContributionEnabled() : true;
  }

  /**
   * Starts membership subsystem: listens on transport, broadcasts initial announcement,
   * and starts periodic signed heartbeat and failure detection loops.
   */
  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    // Subscribe to incoming transport frames
    this.unsubscribeTransport = this.transport.onMessage((raw) => {
      this.handleIncomingMessage(raw);
    });

    // Listen to resource capability / contribution toggle changes
    if (this.resourceManager) {
      this.unsubscribeResources = this.resourceManager.onCapabilitiesChange(() => {
        if (!this.isDestroyed) {
          this.broadcastMembershipMessage("NODE_HEARTBEAT");
          this.emitMembershipChange();
        }
      });
    }

    this.transport.start();

    // Broadcast initial signed announcement with warmup pulses
    this.broadcastMembershipMessage("NODE_ANNOUNCE");
    const warmupDelays = [1000, 2500, 5000];
    for (const delay of warmupDelays) {
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.broadcastMembershipMessage("NODE_ANNOUNCE");
        }
      }, delay);
    }

    // Periodic signed heartbeat loop
    this.heartbeatTimer = setInterval(() => {
      this.broadcastMembershipMessage("NODE_HEARTBEAT");
    }, HEARTBEAT_INTERVAL_MS);

    // Multi-stage liveness evaluation scan
    this.livenessTimer = setInterval(() => {
      this.evaluateLiveness();
    }, CLEANUP_INTERVAL_MS);

    console.log(
      `[WebRoom Membership] 🌐 Started membership overlay for node ${this.identity.getNodeId()} in room ${this.roomId}`
    );
  }

  /**
   * Snapshot of all active network nodes (self + remote peers).
   */
  public getMembers(): NetworkNode[] {
    const selfNode: NetworkNode = {
      nodeId: this.identity.getNodeId(),
      peerId: this.peerId,
      publicKey: this.identity.getPublicKey(),
      lastSeen: Date.now(),
      sequence: this.sequenceNumber,
      status: "online",
      contributionEnabled: this.contributionEnabled,
      capabilities: this.resourceManager?.getCapabilities(),
      avatar: this.avatar,
    };

    return [selfNode, ...this.store.getAllNodes()];
  }

  /**
   * Returns count of online/suspected nodes in this room (self + remote).
   */
  public getMemberCount(): number {
    return 1 + this.store.getNodeCount();
  }

  /**
   * Subscribes to node join events.
   */
  public onNodeJoin(listener: MembershipNodeListener): () => void {
    this.joinListeners.add(listener);
    return () => this.joinListeners.delete(listener);
  }

  /**
   * Subscribes to node suspected events (missed heartbeats).
   */
  public onNodeSuspected(listener: MembershipNodeListener): () => void {
    this.suspectedListeners.add(listener);
    return () => this.suspectedListeners.delete(listener);
  }

  /**
   * Subscribes to node recovered events (resumed heartbeats from suspected node).
   */
  public onNodeRecovered(listener: MembershipNodeListener): () => void {
    this.recoveredListeners.add(listener);
    return () => this.recoveredListeners.delete(listener);
  }

  /**
   * Subscribes to node leave/eviction events.
   */
  public onNodeLeave(listener: MembershipNodeListener): () => void {
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  /**
   * Subscribes to overall membership list updates.
   */
  public onMembershipChange(listener: MembershipListListener): () => void {
    this.changeListeners.add(listener);
    listener(this.getMembers());
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Gracefully leaves the room and releases all timers and channels.
   */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    // Send signed departure message before teardown
    await this.broadcastMembershipMessage("NODE_GOODBYE");

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }

    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }

    if (this.unsubscribeResources) {
      this.unsubscribeResources();
      this.unsubscribeResources = null;
    }

    this.transport.close();
    this.store.clear();

    this.joinListeners.clear();
    this.suspectedListeners.clear();
    this.recoveredListeners.clear();
    this.leaveListeners.clear();
    this.changeListeners.clear();

    console.log(`[WebRoom Membership] 👋 Left membership overlay for room ${this.roomId}`);
  }

  /**
   * Processes incoming membership message frames with signature validation.
   */
  private async handleIncomingMessage(raw: unknown): Promise<void> {
    if (this.isDestroyed) return;

    if (!isValidMembershipMessage(raw, this.roomId)) {
      return;
    }

    const msg = raw as MembershipMessage;

    // Ignore self messages
    if (msg.nodeId === this.identity.getNodeId() || msg.peerId === this.peerId) {
      return;
    }

    // Verify digital signature
    const isSignatureValid = await verifyMembershipMessageSignature(msg);
    if (!isSignatureValid) {
      console.warn(`[WebRoom Membership] ⚠️ Dropped invalid/tampered signature from node ${msg.nodeId}`);
      return;
    }

    switch (msg.type) {
      case "NODE_ANNOUNCE": {
        const node: NetworkNode = {
          nodeId: msg.nodeId,
          peerId: msg.peerId,
          publicKey: msg.publicKey,
          lastSeen: Date.now(),
          sequence: msg.sequence,
          status: "online",
          contributionEnabled: msg.contributionEnabled,
          capabilities: msg.capabilities,
          avatar: msg.avatar,
        };

        const { isNew, wasSuspected } = this.store.upsertNode(node);

        // Immediately reply with signed heartbeat so newcomer discovers us
        this.broadcastMembershipMessage("NODE_HEARTBEAT");

        if (isNew) {
          console.log(`[WebRoom Membership] 🤝 Discovered new node: ${node.nodeId} (Peer: ${node.peerId})`);
          this.emitNodeJoin(node);
          this.emitMembershipChange();
        } else if (wasSuspected) {
          console.log(`[WebRoom Membership] 💚 Suspected node recovered: ${node.nodeId}`);
          this.emitNodeRecovered(node);
          this.emitMembershipChange();
        }
        break;
      }

      case "NODE_HEARTBEAT": {
        const node: NetworkNode = {
          nodeId: msg.nodeId,
          peerId: msg.peerId,
          publicKey: msg.publicKey,
          lastSeen: Date.now(),
          sequence: msg.sequence,
          status: "online",
          contributionEnabled: msg.contributionEnabled,
          capabilities: msg.capabilities,
          avatar: msg.avatar,
        };

        const { isNew, wasSuspected } = this.store.upsertNode(node);

        if (isNew) {
          console.log(`[WebRoom Membership] 🤝 Discovered new node from heartbeat: ${node.nodeId} (Peer: ${node.peerId}) with valid signature ✅`);
          this.emitNodeJoin(node);
          this.emitMembershipChange();
        } else if (wasSuspected) {
          console.log(`[WebRoom Membership] 💚 Suspected node recovered: ${node.nodeId}`);
          this.emitNodeRecovered(node);
          this.emitMembershipChange();
        } else {
          console.log(`[WebRoom Membership] 💓 Verified heartbeat from node ${node.nodeId} (seq: ${node.sequence}) ✅`);
        }
        break;
      }

      case "NODE_GOODBYE": {
        const removed = this.store.removeNode(msg.nodeId);
        if (removed) {
          console.log(`[WebRoom Membership] 👋 Node left gracefully: ${removed.nodeId}`);
          this.emitNodeLeave({ ...removed, status: "offline" });
          this.emitMembershipChange();
        }
        break;
      }
    }
  }

  /**
   * Constructs, cryptographically signs, and broadcasts a membership message.
   */
  private async broadcastMembershipMessage(
    type: MembershipMessage["type"]
  ): Promise<void> {
    if (this.isDestroyed) return;

    this.sequenceNumber += 1;
    const timestamp = Date.now();

    const unsignedPayload = {
      type,
      roomId: this.roomId,
      nodeId: this.identity.getNodeId(),
      peerId: this.peerId,
      timestamp,
      sequence: this.sequenceNumber,
      status: "online" as const,
      contributionEnabled: this.contributionEnabled,
    };

    const canonicalSignaturePayload = getMembershipSignaturePayload(unsignedPayload);
    const signature = await this.identity.sign(canonicalSignaturePayload);

    const message: MembershipMessage = {
      ...unsignedPayload,
      publicKey: this.identity.getPublicKey(),
      signature,
      capabilities: this.resourceManager?.getCapabilities(),
      avatar: this.avatar,
    };

    this.transport.send(message);
    console.log(
      `[WebRoom Membership] 📢 Broadcasted signed ${type} (seq: ${this.sequenceNumber}) for node ${this.identity.getNodeId()}`
    );
  }

  /**
   * Evaluates liveness of remote nodes and emits suspected / eviction events.
   */
  private evaluateLiveness(): void {
    if (this.isDestroyed) return;

    const { newlySuspected, newlyOffline } = this.store.evaluateLiveness(
      SUSPECTED_TIMEOUT_MS,
      NODE_TIMEOUT_MS
    );

    let changed = false;

    if (newlySuspected.length > 0) {
      changed = true;
      for (const node of newlySuspected) {
        console.warn(`[WebRoom Membership] ⚠️ Node suspected (missed heartbeats): ${node.nodeId}`);
        this.emitNodeSuspected(node);
      }
    }

    if (newlyOffline.length > 0) {
      changed = true;
      for (const node of newlyOffline) {
        console.warn(`[WebRoom Membership] ❌ Node timed out and evicted: ${node.nodeId}`);
        this.emitNodeLeave(node);
      }
    }

    if (changed) {
      this.emitMembershipChange();
    }
  }

  private emitNodeJoin(node: NetworkNode): void {
    for (const listener of this.joinListeners) {
      try {
        listener(node);
      } catch (err) {
        console.error("[WebRoom Membership] Error in join listener:", err);
      }
    }
  }

  private emitNodeSuspected(node: NetworkNode): void {
    for (const listener of this.suspectedListeners) {
      try {
        listener(node);
      } catch (err) {
        console.error("[WebRoom Membership] Error in suspected listener:", err);
      }
    }
  }

  private emitNodeRecovered(node: NetworkNode): void {
    for (const listener of this.recoveredListeners) {
      try {
        listener(node);
      } catch (err) {
        console.error("[WebRoom Membership] Error in recovered listener:", err);
      }
    }
  }

  private emitNodeLeave(node: NetworkNode): void {
    for (const listener of this.leaveListeners) {
      try {
        listener(node);
      } catch (err) {
        console.error("[WebRoom Membership] Error in leave listener:", err);
      }
    }
  }

  private emitMembershipChange(): void {
    const members = this.getMembers();
    for (const listener of this.changeListeners) {
      try {
        listener(members);
      } catch (err) {
        console.error("[WebRoom Membership] Error in membership change listener:", err);
      }
    }
  }
}
