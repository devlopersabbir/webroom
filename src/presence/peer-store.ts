/**
 * In-memory state tracking for active peers in a room.
 */

export interface PeerPresence {
  peerId: string;
  lastSeen: number;
}

export class PeerStore {
  private peers = new Map<string, PeerPresence>();

  /**
   * Updates or inserts a peer's last seen timestamp.
   * @returns `true` if this peer was newly added, `false` if existing.
   */
  public updatePeer(peerId: string, timestamp: number = Date.now()): boolean {
    const isNew = !this.peers.has(peerId);
    this.peers.set(peerId, {
      peerId,
      lastSeen: timestamp,
    });
    return isNew;
  }

  /**
   * Removes a peer from the store.
   * @returns `true` if the peer existed and was removed.
   */
  public removePeer(peerId: string): boolean {
    return this.peers.delete(peerId);
  }

  /**
   * Scans and evicts peers who have exceeded the inactivity timeout.
   * @returns List of peerIds that were evicted.
   */
  public cleanupTimedOut(timeoutMs: number, now: number = Date.now()): string[] {
    const evicted: string[] = [];

    for (const [peerId, presence] of this.peers.entries()) {
      if (now - presence.lastSeen > timeoutMs) {
        this.peers.delete(peerId);
        evicted.push(peerId);
      }
    }

    return evicted;
  }

  /**
   * Returns the count of discovered remote peers.
   */
  public getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Returns an array of all active remote peer records.
   */
  public getAllPeers(): PeerPresence[] {
    return Array.from(this.peers.values());
  }

  /**
   * Clears all stored peer presence records.
   */
  public clear(): void {
    this.peers.clear();
  }
}
