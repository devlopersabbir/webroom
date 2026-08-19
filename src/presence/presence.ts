import {
  CLEANUP_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  PEER_TIMEOUT_MS,
} from "../shared/constants";
import { Transport } from "../transport/transport";
import { PeerStore } from "./peer-store";
import { PresenceMessage } from "./protocol";

export type PresenceCountListener = (count: number) => void;

/**
 * Coordinates presence discovery, periodic heartbeats, peer timeout eviction,
 * and online peer count calculations.
 */
export class PresenceManager {
  public readonly roomId: string;
  public readonly peerId: string;
  private readonly transport: Transport;
  private readonly peerStore: PeerStore;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private countListeners = new Set<PresenceCountListener>();
  private isDestroyed = false;
  private lastEmittedCount = 1;

  constructor(
    roomId: string,
    peerId: string,
    transport: Transport,
    peerStore = new PeerStore()
  ) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.transport = transport;
    this.peerStore = peerStore;
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

    // Broadcast initial HELLO to announce ourselves to existing peers
    this.broadcastMessage("HELLO");

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
  }

  private handleMessage(msg: PresenceMessage): void {
    if (this.isDestroyed) {
      return;
    }

    // Ignore self messages
    if (msg.peerId === this.peerId) {
      return;
    }

    // Ignore messages belonging to another room
    if (msg.roomId !== this.roomId) {
      return;
    }

    switch (msg.type) {
      case "HELLO": {
        // A new peer joined. Update their presence and immediately reply with HEARTBEAT
        // so the new peer discovers us without waiting for our periodic heartbeat timer.
        this.peerStore.updatePeer(msg.peerId, msg.timestamp);
        this.broadcastMessage("HEARTBEAT");
        this.notifyCountChange();
        break;
      }

      case "HEARTBEAT": {
        this.peerStore.updatePeer(msg.peerId, msg.timestamp);
        this.notifyCountChange();
        break;
      }

      case "GOODBYE": {
        const removed = this.peerStore.removePeer(msg.peerId);
        if (removed) {
          this.notifyCountChange();
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
}
