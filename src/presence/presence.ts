import {
  CLEANUP_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  PEER_TIMEOUT_MS,
} from "../shared/constants";
import { Transport } from "../transport/transport";
import { PeerStore } from "./peer-store";
import { PresenceMessage, WebRoomMessage } from "./protocol";

export type PresenceCountListener = (count: number) => void;
export type PeerLifecycleListener = (peerId: string) => void;

/**
 * Coordinates presence discovery, periodic heartbeats, peer timeout eviction,
 * and online peer count calculations.
 */
export class PresenceManager {
  public readonly roomId: string;
  public readonly peerId: string;
  public readonly avatar: string;
  private readonly transport: Transport;
  private readonly peerStore: PeerStore;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private countListeners = new Set<PresenceCountListener>();
  private peerJoinListeners = new Set<PeerLifecycleListener>();
  private peerLeaveListeners = new Set<PeerLifecycleListener>();
  private isDestroyed = false;
  private lastEmittedCount = 1;

  constructor(
    roomId: string,
    peerId: string,
    transport: Transport,
    peerStore = new PeerStore(),
    avatar: string = "🐸"
  ) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.transport = transport;
    this.peerStore = peerStore;
    this.avatar = avatar;
  }

  /**
   * Starts discovery, sends HELLO, and starts heartbeat & timeout cleanup loops.
   */
  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    // Subscribe to incoming messages
    this.unsubscribeTransport = this.transport.onMessage((msg) => {
      this.handleMessage(msg);
    });

    // Start transport
    this.transport.start();

    // Broadcast initial HELLO with warmup pulses to guarantee discovery once signaling connects
    this.broadcastMessage("HELLO");
    const warmupDelays = [1000, 2500, 5000];
    for (const delay of warmupDelays) {
      setTimeout(() => {
        if (!this.isDestroyed) {
          this.broadcastMessage("HELLO");
        }
      }, delay);
    }

    // Periodic heartbeat to keep presence alive across peers
    this.heartbeatTimer = setInterval(() => {
      this.broadcastMessage("HEARTBEAT");
    }, HEARTBEAT_INTERVAL_MS);

    // Periodic cleanup to evict silent/crashed peers
    this.cleanupTimer = setInterval(() => {
      this.evictTimedOutPeers();
    }, CLEANUP_INTERVAL_MS);

    // Notify listeners of initial count (1 = self)
    this.notifyCountChange();
  }

  /**
   * Returns current online count (self + discovered active peers).
   */
  public getOnlineCount(): number {
    return 1 + this.peerStore.getPeerCount();
  }

  /**
   * Returns all active remote peer presence records.
   */
  public getPeers() {
    return this.peerStore.getAllPeers();
  }

  /**
   * Subscribes to online count changes.
   * Immediately calls the listener with the current count.
   */
  public onCountChange(listener: PresenceCountListener): () => void {
    this.countListeners.add(listener);
    listener(this.getOnlineCount());

    return () => {
      this.countListeners.delete(listener);
    };
  }

  /**
   * Subscribes to peer join events.
   */
  public onPeerJoin(listener: PeerLifecycleListener): () => void {
    this.peerJoinListeners.add(listener);
    return () => {
      this.peerJoinListeners.delete(listener);
    };
  }

  /**
   * Subscribes to peer leave events.
   */
  public onPeerLeave(listener: PeerLifecycleListener): () => void {
    this.peerLeaveListeners.add(listener);
    return () => {
      this.peerLeaveListeners.delete(listener);
    };
  }

  /**
   * Gracefully leaves the room and tears down all timers and transport channels.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    // Send graceful GOODBYE notice to peers before closing transport
    this.broadcastMessage("GOODBYE");

    this.isDestroyed = true;

    // Stop heartbeat and cleanup timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Unsubscribe from transport
    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }

    // Close transport
    this.transport.close();

    // Clear peers
    this.peerStore.clear();
    this.countListeners.clear();
    this.peerJoinListeners.clear();
    this.peerLeaveListeners.clear();
  }

  private handleMessage(msg: WebRoomMessage): void {
    if (this.isDestroyed) {
      return;
    }

    // Ignore messages belonging to another room
    if (msg.roomId !== this.roomId) {
      return;
    }

    if (msg.type !== "HELLO" && msg.type !== "HEARTBEAT" && msg.type !== "GOODBYE") {
      return;
    }

    // Ignore self messages
    if (msg.peerId === this.peerId) {
      return;
    }

    switch (msg.type) {
      case "HELLO": {
        // A new peer joined. Update their presence using local receiver timestamp
        // and immediately reply with HEARTBEAT so the new peer discovers us.
        const isNew = this.peerStore.updatePeer(msg.peerId, Date.now(), msg.avatar);
        this.broadcastMessage("HEARTBEAT");
        if (isNew) {
          this.notifyCountChange();
          this.notifyPeerJoin(msg.peerId);
        }
        break;
      }

      case "HEARTBEAT": {
        const isNew = this.peerStore.updatePeer(msg.peerId, Date.now(), msg.avatar);
        if (isNew) {
          this.notifyCountChange();
          this.notifyPeerJoin(msg.peerId);
        }
        break;
      }

      case "GOODBYE": {
        const removed = this.peerStore.removePeer(msg.peerId);
        if (removed) {
          this.notifyCountChange();
          this.notifyPeerLeave(msg.peerId);
        }
        break;
      }
    }
  }

  private broadcastMessage(type: PresenceMessage["type"]): void {
    if (this.isDestroyed) {
      return;
    }

    const message: PresenceMessage = {
      type,
      roomId: this.roomId,
      peerId: this.peerId,
      avatar: this.avatar,
      timestamp: Date.now(),
    };

    this.transport.send(message);
  }

  private evictTimedOutPeers(): void {
    if (this.isDestroyed) {
      return;
    }

    const evicted = this.peerStore.cleanupTimedOut(PEER_TIMEOUT_MS);
    if (evicted.length > 0) {
      this.notifyCountChange();
      for (const peerId of evicted) {
        this.notifyPeerLeave(peerId);
      }
    }
  }

  private notifyCountChange(): void {
    const currentCount = this.getOnlineCount();
    this.lastEmittedCount = currentCount;
    for (const listener of this.countListeners) {
      try {
        listener(currentCount);
      } catch (err) {
        console.error("[WebRoom Presence] Error in count listener:", err);
      }
    }
  }

  private notifyPeerJoin(peerId: string): void {
    for (const listener of this.peerJoinListeners) {
      try {
        listener(peerId);
      } catch (err) {
        console.error("[WebRoom Presence] Error in peer join listener:", err);
      }
    }
  }

  private notifyPeerLeave(peerId: string): void {
    for (const listener of this.peerLeaveListeners) {
      try {
        listener(peerId);
      } catch (err) {
        console.error("[WebRoom Presence] Error in peer leave listener:", err);
      }
    }
  }
}

