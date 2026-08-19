import { WebRoomMessage } from "../presence/protocol";
import { Transport } from "../transport/transport";
import {
  FollowCursorMessage,
  FollowMessage,
  FollowNavigateMessage,
  FollowScrollMessage,
  FollowSelectionMessage,
  FollowStartMessage,
  FollowStopMessage,
} from "./follow-protocol";
import { FollowPeerInfo, FollowStore } from "./follow-store";

export type FollowStateListener = (
  following: FollowPeerInfo | null,
  followers: Map<string, FollowPeerInfo>
) => void;

export interface FollowCursorState {
  leaderId: string;
  leaderAvatar: string;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  percentageX: number;
  percentageY: number;
  isHovering?: boolean;
  isClicking?: boolean;
  timestamp: number;
}

export type FollowCursorListener = (cursor: FollowCursorState | null) => void;
export type FollowSelectionListener = (selection: string) => void;

/**
 * Coordinates follow relationships, live mouse cursor broadcast,
 * hover/click ripple detection, selection sync, and ultra-smooth viewport scrolling.
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
  private cursorListeners = new Set<FollowCursorListener>();
  private selectionListeners = new Set<FollowSelectionListener>();

  // Current active remote cursor from leader
  private currentLeaderCursor: FollowCursorState | null = null;
  private currentLeaderSelection = "";

  // Flag to suppress echoing back remote programmatic scrolls
  private isApplyingRemoteScroll = false;
  private remoteScrollResetTimer: ReturnType<typeof setTimeout> | null = null;

  // Smooth scroll interpolation loop
  private smoothScrollRafId: number | null = null;
  private targetScrollX = 0;
  private targetScrollY = 0;

  // Scroll throttling
  private scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScrollBroadcast = false;
  private boundScrollListener: (() => void) | null = null;

  // Cursor tracking & throttling (when leading)
  private boundMouseMoveListener: ((e: MouseEvent) => void) | null = null;
  private boundClickListener: ((e: MouseEvent) => void) | null = null;
  private boundSelectionListener: (() => void) | null = null;
  private cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private latestMouseCoords: { clientX: number; clientY: number; pageX: number; pageY: number; isHovering: boolean } | null = null;

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
   * Initializes transport subscriptions and DOM event listeners.
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

      this.boundMouseMoveListener = (e: MouseEvent) => this.handleLocalMouseMove(e);
      window.addEventListener("mousemove", this.boundMouseMoveListener, { passive: true });

      this.boundClickListener = (e: MouseEvent) => this.handleLocalClick(e);
      window.addEventListener("click", this.boundClickListener, { capture: true, passive: true });

      if (typeof document !== "undefined") {
        this.boundSelectionListener = () => this.handleLocalSelection();
        document.addEventListener("selectionchange", this.boundSelectionListener, { passive: true });
      }
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
      this.currentLeaderCursor = null;
      this.currentLeaderSelection = "";
      this.notifyCursorChange(null);
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
   * Returns the latest live mouse cursor state from the followed leader.
   */
  public getLeaderCursor(): FollowCursorState | null {
    return this.currentLeaderCursor;
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
   * Subscribes to live cursor movements from the leader.
   */
  public onCursorChange(listener: FollowCursorListener): () => void {
    this.cursorListeners.add(listener);
    listener(this.currentLeaderCursor);

    return () => {
      this.cursorListeners.delete(listener);
    };
  }

  /**
   * Subscribes to live text selections from the leader.
   */
  public onSelectionChange(listener: FollowSelectionListener): () => void {
    this.selectionListeners.add(listener);
    listener(this.currentLeaderSelection);

    return () => {
      this.selectionListeners.delete(listener);
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
      this.currentLeaderCursor = null;
      this.currentLeaderSelection = "";
      this.notifyCursorChange(null);
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

    if (this.boundMouseMoveListener && typeof window !== "undefined") {
      window.removeEventListener("mousemove", this.boundMouseMoveListener);
      this.boundMouseMoveListener = null;
    }

    if (this.boundClickListener && typeof window !== "undefined") {
      window.removeEventListener("click", this.boundClickListener, { capture: true });
      this.boundClickListener = null;
    }

    if (this.boundSelectionListener && typeof document !== "undefined") {
      document.removeEventListener("selectionchange", this.boundSelectionListener);
      this.boundSelectionListener = null;
    }

    if (this.smoothScrollRafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.smoothScrollRafId);
      this.smoothScrollRafId = null;
    }

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }

    if (this.cursorThrottleTimer) {
      clearTimeout(this.cursorThrottleTimer);
      this.cursorThrottleTimer = null;
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
    this.cursorListeners.clear();
    this.selectionListeners.clear();
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
          this.currentLeaderCursor = null;
          this.currentLeaderSelection = "";
          this.notifyCursorChange(null);
          this.notifyStateChange();
        }
        break;
      }

      case "FOLLOW_NAVIGATE": {
        // Leader navigated away to a different URL -> terminate follow relationship
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          this.store.clearFollowing();
          this.currentLeaderCursor = null;
          this.currentLeaderSelection = "";
          this.notifyCursorChange(null);
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

      case "FOLLOW_CURSOR": {
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          this.currentLeaderCursor = {
            leaderId: msg.leaderId,
            leaderAvatar: msg.leaderAvatar,
            clientX: msg.clientX,
            clientY: msg.clientY,
            pageX: msg.pageX,
            pageY: msg.pageY,
            percentageX: msg.percentageX,
            percentageY: msg.percentageY,
            isHovering: msg.isHovering,
            isClicking: msg.isClicking,
            timestamp: msg.timestamp,
          };
          this.notifyCursorChange(this.currentLeaderCursor);
        }
        break;
      }

      case "FOLLOW_SELECTION": {
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          this.currentLeaderSelection = msg.selectedText;
          this.notifySelectionChange(msg.selectedText);
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
    }, 30);
  }

  /**
   * Captures mouse movements when leading followers.
   */
  private handleLocalMouseMove(e: MouseEvent): void {
    if (this.isDestroyed || this.store.getFollowerCount() === 0) {
      return;
    }

    let isHovering = false;
    const target = e.target as HTMLElement | null;
    if (target && target.nodeType === 1) {
      const tag = target.tagName;
      isHovering =
        tag === "BUTTON" ||
        tag === "A" ||
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        target.getAttribute("role") === "button" ||
        target.onclick !== null;
    }

    this.latestMouseCoords = {
      clientX: e.clientX,
      clientY: e.clientY,
      pageX: e.pageX,
      pageY: e.pageY,
      isHovering,
    };

    if (this.cursorThrottleTimer) {
      return;
    }

    this.broadcastCursor(this.latestMouseCoords, false);

    this.cursorThrottleTimer = setTimeout(() => {
      this.cursorThrottleTimer = null;
      if (this.latestMouseCoords) {
        this.broadcastCursor(this.latestMouseCoords, false);
      }
    }, 30);
  }

  /**
   * Captures click events to broadcast click ripple effect to followers.
   */
  private handleLocalClick(e: MouseEvent): void {
    if (this.isDestroyed || this.store.getFollowerCount() === 0) {
      return;
    }

    this.broadcastCursor(
      {
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        isHovering: true,
      },
      true
    );
  }

  /**
   * Captures active text selections to broadcast to followers.
   */
  private handleLocalSelection(): void {
    if (this.isDestroyed || this.store.getFollowerCount() === 0) {
      return;
    }

    const sel = typeof window !== "undefined" ? window.getSelection()?.toString().trim() || "" : "";
    if (sel.length > 0 && sel.length < 500) {
      const message: FollowSelectionMessage = {
        type: "FOLLOW_SELECTION",
        roomId: this.roomId,
        leaderId: this.peerId,
        selectedText: sel,
        timestamp: Date.now(),
      };
      this.transport.send(message);
    }
  }

  /**
   * Broadcasts live cursor position to followers.
   */
  private broadcastCursor(
    coords: { clientX: number; clientY: number; pageX: number; pageY: number; isHovering: boolean },
    isClicking = false
  ): void {
    if (typeof window === "undefined" || this.isDestroyed) {
      return;
    }

    const winW = window.innerWidth || 1;
    const winH = window.innerHeight || 1;

    const message: FollowCursorMessage = {
      type: "FOLLOW_CURSOR",
      roomId: this.roomId,
      leaderId: this.peerId,
      leaderAvatar: this.avatar,
      clientX: Math.round(coords.clientX),
      clientY: Math.round(coords.clientY),
      pageX: Math.round(coords.pageX),
      pageY: Math.round(coords.pageY),
      percentageX: Number((coords.clientX / winW).toFixed(4)),
      percentageY: Number((coords.clientY / winH).toFixed(4)),
      isHovering: coords.isHovering,
      isClicking,
      timestamp: Date.now(),
    };

    this.transport.send(message);
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
   * Applies remote scroll position with ultra-smooth spring/lerp loop.
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

    this.targetScrollY = Math.max(0, Math.min(targetY, localMaxScrollY));
    this.targetScrollX = Math.max(0, Math.min(targetX, localMaxScrollX));

    this.isApplyingRemoteScroll = true;
    if (this.remoteScrollResetTimer) {
      clearTimeout(this.remoteScrollResetTimer);
    }

    // Start RAF-based smooth lerp scroll loop
    this.startSmoothScrollLoop();

    // Reset suppression flag after smooth scroll transition completes
    this.remoteScrollResetTimer = setTimeout(() => {
      this.isApplyingRemoteScroll = false;
      this.remoteScrollResetTimer = null;
    }, 180);
  }

  /**
   * Linear Interpolation (Lerp) spring animation loop for butter-smooth viewport following.
   */
  private startSmoothScrollLoop(): void {
    if (typeof window === "undefined" || typeof requestAnimationFrame === "undefined") {
      try {
        window.scrollTo({ top: this.targetScrollY, left: this.targetScrollX, behavior: "smooth" });
      } catch {
        window.scrollTo(this.targetScrollX, this.targetScrollY);
      }
      return;
    }

    if (this.smoothScrollRafId !== null) {
      cancelAnimationFrame(this.smoothScrollRafId);
    }

    const step = () => {
      if (this.isDestroyed) return;

      const currentY = window.scrollY || window.pageYOffset || 0;
      const currentX = window.scrollX || window.pageXOffset || 0;

      const diffY = this.targetScrollY - currentY;
      const diffX = this.targetScrollX - currentX;

      if (Math.abs(diffY) < 1 && Math.abs(diffX) < 1) {
        window.scrollTo(this.targetScrollX, this.targetScrollY);
        this.smoothScrollRafId = null;
        return;
      }

      // Smooth dampening factor (0.24 provides snappy yet organic glide)
      const nextY = currentY + diffY * 0.24;
      const nextX = currentX + diffX * 0.24;

      window.scrollTo(nextX, nextY);
      this.smoothScrollRafId = requestAnimationFrame(step);
    };

    this.smoothScrollRafId = requestAnimationFrame(step);
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

  private notifyCursorChange(cursor: FollowCursorState | null): void {
    for (const listener of this.cursorListeners) {
      try {
        listener(cursor);
      } catch (err) {
        console.error("[WebRoom Follow] Error in cursor listener:", err);
      }
    }
  }

  private notifySelectionChange(selection: string): void {
    for (const listener of this.selectionListeners) {
      try {
        listener(selection);
      } catch (err) {
        console.error("[WebRoom Follow] Error in selection listener:", err);
      }
    }
  }
}
