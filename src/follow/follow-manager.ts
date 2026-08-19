import { WebRoomMessage } from "../presence/protocol";
import { Transport } from "../transport/transport";
import {
  FollowMessage,
  FollowNavigateMessage,
  FollowScrollMessage,
  FollowStartMessage,
  FollowStopMessage,
} from "./follow-protocol";
import { FollowPeerInfo, FollowStore } from "./follow-store";

export type FollowStateListener = (following: FollowPeerInfo | null, followers: Map<string, FollowPeerInfo>) => void;

/**
 * Coordinates follow relationships, scroll synchronization, feedback loop prevention,
 * and automatic termination on navigation or disconnection.
 */
export class FollowManager {
  public readonly roomId: string;
  public readonly peerId: string;
  public readonly avatar: string;
  private readonly transport: Transport;
  private readonly store: FollowStore;

  private isDestroyed = false;
  private unsubscribeTransport: (() => void) | null = null;
  private stateListeners = new Set<FollowStateListener>();

  // Flag to suppress echoing back remote programmatic scrolls
  private isApplyingRemoteScroll = false;
  private remoteScrollResetTimer: ReturnType<typeof setTimeout> | null = null;

  // Scroll throttling
  private scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScrollBroadcast = false;
  private boundScrollListener: (() => void) | null = null;

  constructor(
    roomId: string,
    peerId: string,
    avatar: string,
    transport: Transport,
    store = new FollowStore()
  ) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.avatar = avatar;
    this.transport = transport;
    this.store = store;
  }

  /**
   * Initializes transport subscriptions and window scroll listeners.
   */
  public start(): void {
    if (this.isDestroyed) {
      return;
    }

    this.unsubscribeTransport = this.transport.onMessage((msg) => {
      this.handleMessage(msg);
    });

    if (typeof window !== "undefined") {
      this.boundScrollListener = () => this.handleLocalScroll();
      window.addEventListener("scroll", this.boundScrollListener, { passive: true });
    }
  }

  /**
   * Starts following a remote leader.
   * If already following someone else, unfollows previous leader automatically.
   */
  public followUser(leaderId: string, leaderAvatar: string = "🐸"): void {
    if (this.isDestroyed || leaderId === this.peerId) {
      return;
    }

    const currentFollowing = this.store.getFollowing();
    if (currentFollowing?.peerId === leaderId) {
      return;
    }

    // If following another user, stop following them first
    if (currentFollowing) {
      this.broadcastStop(currentFollowing.peerId);
    }

    this.store.setFollowing(leaderId, leaderAvatar);
    this.broadcastStart(leaderId);
    this.notifyStateChange();
  }

  /**
   * Stops following the current leader.
   */
  public unfollowUser(): void {
    if (this.isDestroyed) {
      return;
    }

    const prev = this.store.clearFollowing();
    if (prev) {
      this.broadcastStop(prev.peerId);
      this.notifyStateChange();
    }
  }

  /**
   * Returns the current leader being followed, or null.
   */
  public getFollowing(): FollowPeerInfo | null {
    return this.store.getFollowing();
  }

  /**
   * Returns all active remote peers following this user.
   */
  public getFollowers(): Map<string, FollowPeerInfo> {
    return this.store.getFollowers();
  }

  /**
   * Subscribes to follow state updates (following leader & followers map).
   */
  public onStateChange(listener: FollowStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getFollowing(), this.getFollowers());

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Called when a peer disconnects or leaves the room.
   */
  public handlePeerLeft(remotePeerId: string): void {
    if (this.isDestroyed) {
      return;
    }

    let stateChanged = false;

    // If the leader we are following left, terminate follow immediately
    const following = this.store.getFollowing();
    if (following?.peerId === remotePeerId) {
      this.store.clearFollowing();
      stateChanged = true;
    }

    // If a follower left, remove them
    if (this.store.removeFollower(remotePeerId)) {
      stateChanged = true;
    }

    if (stateChanged) {
      this.notifyStateChange();
    }
  }

  /**
   * Gracefully tears down listeners and notifies peers if this leader/follower leaves.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;

    // If this leader has followers, notify them that leader is navigating away/leaving
    if (this.store.getFollowerCount() > 0) {
      this.broadcastNavigate();
    }

    // If following someone, send stop
    const following = this.store.getFollowing();
    if (following) {
      this.broadcastStop(following.peerId);
    }

    if (this.boundScrollListener && typeof window !== "undefined") {
      window.removeEventListener("scroll", this.boundScrollListener);
      this.boundScrollListener = null;
    }

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }

    if (this.remoteScrollResetTimer) {
      clearTimeout(this.remoteScrollResetTimer);
      this.remoteScrollResetTimer = null;
    }

    if (this.unsubscribeTransport) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = null;
    }

    this.store.clear();
    this.stateListeners.clear();
  }

  /**
   * Handles incoming WebRoom messages for Follow Mode.
   */
  private handleMessage(msg: WebRoomMessage): void {
    if (this.isDestroyed || msg.roomId !== this.roomId) {
      return;
    }

    switch (msg.type) {
      case "FOLLOW_START": {
        if (msg.leaderId === this.peerId && msg.followerId !== this.peerId) {
          const isNew = this.store.addFollower(msg.followerId, msg.followerAvatar);
          if (isNew) {
            this.notifyStateChange();
            // Broadcast initial scroll position immediately to newly joined follower
            this.broadcastCurrentScroll();
          }
        }
        break;
      }

      case "FOLLOW_STOP": {
        if (msg.leaderId === this.peerId) {
          const removed = this.store.removeFollower(msg.followerId);
          if (removed) {
            this.notifyStateChange();
          }
        } else if (msg.followerId === this.peerId && this.store.getFollowing()?.peerId === msg.leaderId) {
          this.store.clearFollowing();
          this.notifyStateChange();
        }
        break;
      }

      case "FOLLOW_NAVIGATE": {
        // Leader navigated away to a different URL -> terminate follow relationship
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          this.store.clearFollowing();
          this.notifyStateChange();
        }
        break;
      }

      case "FOLLOW_SCROLL": {
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          this.applyRemoteScroll(msg);
        }
        break;
      }
    }
  }

  /**
   * Captures and throttles local window scrolling when leading followers.
   */
  private handleLocalScroll(): void {
    if (this.isDestroyed || this.isApplyingRemoteScroll) {
      return;
    }

    // Only broadcast if we have followers
    if (this.store.getFollowerCount() === 0) {
      return;
    }

    if (this.scrollThrottleTimer) {
      this.pendingScrollBroadcast = true;
      return;
    }

    this.broadcastCurrentScroll();

    this.scrollThrottleTimer = setTimeout(() => {
      this.scrollThrottleTimer = null;
      if (this.pendingScrollBroadcast) {
        this.pendingScrollBroadcast = false;
        this.broadcastCurrentScroll();
      }
    }, 35);
  }

  /**
   * Reads the current viewport scroll position and broadcasts to followers.
   */
  public broadcastCurrentScroll(): void {
    if (typeof window === "undefined" || typeof document === "undefined" || this.isDestroyed) {
      return;
    }

    const doc = document.documentElement || document.body;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    const maxScrollX = Math.max(0, doc.scrollWidth - window.innerWidth);
    const maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);

    const scrollPercentageX = maxScrollX > 0 ? scrollX / maxScrollX : 0;
    const scrollPercentageY = maxScrollY > 0 ? scrollY / maxScrollY : 0;

    const message: FollowScrollMessage = {
      type: "FOLLOW_SCROLL",
      roomId: this.roomId,
      leaderId: this.peerId,
      scrollX: Math.round(scrollX),
      scrollY: Math.round(scrollY),
      maxScrollX: Math.round(maxScrollX),
      maxScrollY: Math.round(maxScrollY),
      scrollPercentageX: Number(scrollPercentageX.toFixed(4)),
      scrollPercentageY: Number(scrollPercentageY.toFixed(4)),
      timestamp: Date.now(),
    };

    this.transport.send(message);
  }

  /**
   * Applies remote scroll position to follower's window smoothly without triggering echo broadcasts.
   */
  private applyRemoteScroll(msg: FollowScrollMessage): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const doc = document.documentElement || document.body;
    const localMaxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
    const localMaxScrollX = Math.max(0, doc.scrollWidth - window.innerWidth);

    let targetY = msg.scrollY;
    let targetX = msg.scrollX;

    // If local document height differs significantly, use percentage interpolation
    if (msg.maxScrollY > 0 && Math.abs(msg.maxScrollY - localMaxScrollY) > 60) {
      targetY = Math.round(msg.scrollPercentageY * localMaxScrollY);
    }
    if (msg.maxScrollX > 0 && Math.abs(msg.maxScrollX - localMaxScrollX) > 60) {
      targetX = Math.round(msg.scrollPercentageX * localMaxScrollX);
    }

    // Clamp within local viewport bounds
    targetY = Math.max(0, Math.min(targetY, localMaxScrollY));
    targetX = Math.max(0, Math.min(targetX, localMaxScrollX));

    this.isApplyingRemoteScroll = true;
    if (this.remoteScrollResetTimer) {
      clearTimeout(this.remoteScrollResetTimer);
    }

    try {
      window.scrollTo({
        top: targetY,
        left: targetX,
        behavior: "smooth",
      });
    } catch {
      window.scrollTo(targetX, targetY);
    }

    // Reset suppression flag after smooth scroll transition completes
    this.remoteScrollResetTimer = setTimeout(() => {
      this.isApplyingRemoteScroll = false;
      this.remoteScrollResetTimer = null;
    }, 120);
  }

  private broadcastStart(leaderId: string): void {
    const message: FollowStartMessage = {
      type: "FOLLOW_START",
      roomId: this.roomId,
      followerId: this.peerId,
      followerAvatar: this.avatar,
      leaderId,
      timestamp: Date.now(),
    };
    this.transport.send(message);
  }

  private broadcastStop(leaderId: string): void {
    const message: FollowStopMessage = {
      type: "FOLLOW_STOP",
      roomId: this.roomId,
      followerId: this.peerId,
      leaderId,
      timestamp: Date.now(),
    };
    this.transport.send(message);
  }

  private broadcastNavigate(): void {
    const message: FollowNavigateMessage = {
      type: "FOLLOW_NAVIGATE",
      roomId: this.roomId,
      leaderId: this.peerId,
      timestamp: Date.now(),
    };
    this.transport.send(message);
  }

  private notifyStateChange(): void {
    const following = this.getFollowing();
    const followers = this.getFollowers();
    for (const listener of this.stateListeners) {
      try {
        listener(following, followers);
      } catch (err) {
        console.error("[WebRoom Follow] Error in state listener:", err);
      }
    }
  }
}
