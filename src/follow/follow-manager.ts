import { WebRoomMessage } from "../presence/protocol";
import { Transport } from "../transport/transport";
import {
  captureCursorAnchor,
  captureScrollAnchor,
  captureSelectionAnchor,
  resolveCursorPosition,
  resolveElementSelector,
  resolveSelectionRects,
} from "./dom-anchor";
import {
  FollowCursorMessage,
  FollowNavigateMessage,
  FollowScrollMessage,
  FollowSelectionMessage,
  FollowStartMessage,
  FollowStopMessage,
  SelectionRect,
} from "./follow-protocol";
import { FollowPeerInfo, FollowStore } from "./follow-store";

export type FollowStateListener = (
  following: FollowPeerInfo | null,
  followers: Map<string, FollowPeerInfo>,
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
  elementRect?: SelectionRect;
  isHovering?: boolean;
  isClicking?: boolean;
  timestamp: number;
}

export interface FollowSelectionState {
  leaderId: string;
  leaderAvatar: string;
  selectedText: string;
  rect?: SelectionRect;
  rects?: SelectionRect[];
  timestamp: number;
}

export type FollowCursorListener = (cursor: FollowCursorState | null) => void;
export type FollowSelectionListener = (
  selection: FollowSelectionState | null,
) => void;

const PENDING_FOLLOW_STORAGE_KEY = "webroom_pending_follow";
const PENDING_FOLLOW_TTL_MS = 15000;

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

  // Current active remote cursor & selection from leader
  private currentLeaderCursor: FollowCursorState | null = null;
  private currentLeaderSelection: FollowSelectionState | null = null;

  // Flag to suppress echoing back remote programmatic scrolls
  private isApplyingRemoteScroll = false;
  private remoteScrollResetTimer: ReturnType<typeof setTimeout> | null = null;

  // Smooth scroll interpolation loop (continuous delta-time exponential smoothing)
  private smoothScrollRafId: number | null = null;
  private smoothScrollLastFrameTime = 0;
  private targetScrollX = 0;
  private targetScrollY = 0;
  private targetContainerEl: Element | null = null;
  private targetContainerX = 0;
  private targetContainerY = 0;

  // Scroll throttling + settle alignment
  private scrollThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollSettleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingScrollBroadcast = false;
  private lastScrollTarget: EventTarget | null = null;
  private boundScrollListener: ((e: Event) => void) | null = null;

  // Cursor tracking & throttling (when leading)
  private boundMouseMoveListener: ((e: MouseEvent) => void) | null = null;
  private boundClickListener: ((e: MouseEvent) => void) | null = null;
  private boundSelectionListener: (() => void) | null = null;
  private cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private latestMouseCoords: {
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
    isHovering: boolean;
  } | null = null;

  constructor(
    roomId: string,
    peerId: string,
    avatar: string,
    transport: Transport,
    store = new FollowStore(),
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

    // Resume an active follow session seamlessly if the tab just navigated to follow a leader
    this.restorePendingFollowIfAny();

    if (typeof window !== "undefined") {
      this.boundScrollListener = (e: Event) => this.handleLocalScroll(e);
      window.addEventListener("scroll", this.boundScrollListener, {
        capture: true,
        passive: true,
      });

      this.boundMouseMoveListener = (e: MouseEvent) =>
        this.handleLocalMouseMove(e);
      window.addEventListener("mousemove", this.boundMouseMoveListener, {
        passive: true,
      });

      this.boundClickListener = (e: MouseEvent) => this.handleLocalClick(e);
      window.addEventListener("click", this.boundClickListener, {
        capture: true,
        passive: true,
      });

      if (typeof document !== "undefined") {
        this.boundSelectionListener = () => this.handleLocalSelection();
        document.addEventListener(
          "selectionchange",
          this.boundSelectionListener,
          { passive: true },
        );
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
      this.currentLeaderSelection = null;
      this.notifyCursorChange(null);
      this.notifySelectionChange(null);
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
   * Returns the latest live selection from the followed leader.
   */
  public getLeaderSelection(): FollowSelectionState | null {
    return this.currentLeaderSelection;
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
      this.currentLeaderSelection = null;
      this.notifyCursorChange(null);
      this.notifySelectionChange(null);
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
      window.removeEventListener("scroll", this.boundScrollListener, {
        capture: true,
      });
      this.boundScrollListener = null;
    }

    if (this.boundMouseMoveListener && typeof window !== "undefined") {
      window.removeEventListener("mousemove", this.boundMouseMoveListener);
      this.boundMouseMoveListener = null;
    }

    if (this.boundClickListener && typeof window !== "undefined") {
      window.removeEventListener("click", this.boundClickListener, {
        capture: true,
      });
      this.boundClickListener = null;
    }

    if (this.boundSelectionListener && typeof document !== "undefined") {
      document.removeEventListener(
        "selectionchange",
        this.boundSelectionListener,
      );
      this.boundSelectionListener = null;
    }

    if (
      this.smoothScrollRafId !== null &&
      typeof cancelAnimationFrame !== "undefined"
    ) {
      cancelAnimationFrame(this.smoothScrollRafId);
      this.smoothScrollRafId = null;
    }

    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }

    if (this.scrollSettleTimer) {
      clearTimeout(this.scrollSettleTimer);
      this.scrollSettleTimer = null;
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
   * Notifies followers when the leader navigates to a new path on the same host (SPA navigation),
   * so followers' tabs stay in sync on the same page.
   */
  public handleLocalPathChange(newUrl: string): void {
    if (this.isDestroyed || this.store.getFollowerCount() === 0) {
      return;
    }

    let pathname: string | undefined;
    try {
      pathname = new URL(newUrl).pathname;
    } catch {
      pathname = undefined;
    }

    const message: FollowNavigateMessage = {
      type: "FOLLOW_NAVIGATE",
      roomId: this.roomId,
      leaderId: this.peerId,
      url: newUrl,
      pathname,
      timestamp: Date.now(),
    };
    this.transport.send(message);
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
          const isNew = this.store.addFollower(
            msg.followerId,
            msg.followerAvatar,
          );
          if (isNew) {
            this.notifyStateChange();
          }
          // Sync leader's current path, scroll position, and cursor immediately
          if (typeof window !== "undefined" && window.location?.href) {
            this.handleLocalPathChange(window.location.href);
          }
          this.broadcastCurrentScroll();
          if (this.latestMouseCoords) {
            this.broadcastCursor(this.latestMouseCoords, false);
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
        } else if (
          msg.followerId === this.peerId &&
          this.store.getFollowing()?.peerId === msg.leaderId
        ) {
          this.clearPendingFollow();
          this.store.clearFollowing();
          this.currentLeaderCursor = null;
          this.currentLeaderSelection = null;
          this.notifyCursorChange(null);
          this.notifySelectionChange(null);
          this.notifyStateChange();
        }
        break;
      }

      case "FOLLOW_NAVIGATE": {
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          if (msg.url) {
            // Leader navigated to another path on the same host -> follow them there!
            this.navigateToLeaderUrl(msg.url, currentFollowing);
          } else {
            // Leader left the host / closed tab -> terminate follow relationship
            this.clearPendingFollow();
            this.store.clearFollowing();
            this.currentLeaderCursor = null;
            this.currentLeaderSelection = null;
            this.notifyCursorChange(null);
            this.notifySelectionChange(null);
            this.notifyStateChange();
          }
        }
        break;
      }

      case "FOLLOW_SCROLL": {
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          if (msg.url && this.isDifferentPath(msg.pathname)) {
            this.navigateToLeaderUrl(msg.url, currentFollowing);
            return;
          }
          this.applyRemoteScroll(msg);
        }
        break;
      }

      case "FOLLOW_CURSOR": {
        const currentFollowing = this.store.getFollowing();
        if (currentFollowing?.peerId === msg.leaderId) {
          const resolved = resolveCursorPosition(
            {
              selector: msg.elementSelector,
              offsetXRatio: msg.elementOffsetX,
              offsetYRatio: msg.elementOffsetY,
            },
            msg.percentageX,
            msg.percentageY,
          );
          this.currentLeaderCursor = {
            leaderId: msg.leaderId,
            leaderAvatar: msg.leaderAvatar,
            clientX:
              typeof window !== "undefined" ? resolved.clientX : msg.clientX,
            clientY:
              typeof window !== "undefined" ? resolved.clientY : msg.clientY,
            pageX: msg.pageX,
            pageY: msg.pageY,
            percentageX: msg.percentageX,
            percentageY: msg.percentageY,
            elementRect: resolved.elementRect,
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
          if (msg.selectedText && msg.selectedText.trim().length > 0) {
            const rects = resolveSelectionRects(
              msg.selectedText,
              msg.elementSelector,
              msg.startOffset,
            );
            this.currentLeaderSelection = {
              leaderId: msg.leaderId,
              leaderAvatar: msg.leaderAvatar || currentFollowing.avatar || "🐸",
              selectedText: msg.selectedText,
              rect: rects[0] || msg.rect,
              rects: rects.length > 0 ? rects : undefined,
              timestamp: msg.timestamp,
            };
          } else {
            this.currentLeaderSelection = null;
          }
          this.notifySelectionChange(this.currentLeaderSelection);
        }
        break;
      }
    }
  }

  /**
   * Captures and throttles local window & inner-container scrolling when leading followers.
   */
  private handleLocalScroll(event?: Event): void {
    if (this.isDestroyed || this.isApplyingRemoteScroll) {
      return;
    }

    if (this.store.getFollowerCount() === 0) {
      return;
    }

    this.lastScrollTarget = event?.target || null;

    // Schedule a settled anchor-alignment pulse once leader stops scrolling (140ms)
    if (this.scrollSettleTimer) {
      clearTimeout(this.scrollSettleTimer);
    }
    this.scrollSettleTimer = setTimeout(() => {
      this.scrollSettleTimer = null;
      if (!this.isDestroyed && this.store.getFollowerCount() > 0) {
        this.broadcastCurrentScroll(this.lastScrollTarget, true);
      }
    }, 140);

    if (this.scrollThrottleTimer) {
      this.pendingScrollBroadcast = true;
      return;
    }

    this.broadcastCurrentScroll(this.lastScrollTarget, false);

    this.scrollThrottleTimer = setTimeout(() => {
      this.scrollThrottleTimer = null;
      if (this.pendingScrollBroadcast) {
        this.pendingScrollBroadcast = false;
        this.broadcastCurrentScroll(this.lastScrollTarget, false);
      }
    }, 50);
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
    }, 25);
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
      true,
    );
  }

  /**
   * Captures active text selections and bounding boxes to broadcast to followers.
   */
  private handleLocalSelection(): void {
    if (this.isDestroyed || this.store.getFollowerCount() === 0) {
      return;
    }

    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    const text = sel?.toString().trim() || "";
    if (text.length > 0 && text.length < 500 && sel && sel.rangeCount > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const anchor = captureSelectionAnchor(sel);
        const message: FollowSelectionMessage = {
          type: "FOLLOW_SELECTION",
          roomId: this.roomId,
          leaderId: this.peerId,
          leaderAvatar: this.avatar,
          pathname: window.location?.pathname,
          elementSelector: anchor.selector,
          startOffset: anchor.startOffset,
          selectedText: text,
          rect: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          timestamp: Date.now(),
        };
        this.transport.send(message);
        return;
      } catch {}
    }

    const message: FollowSelectionMessage = {
      type: "FOLLOW_SELECTION",
      roomId: this.roomId,
      leaderId: this.peerId,
      leaderAvatar: this.avatar,
      selectedText: "",
      timestamp: Date.now(),
    };
    this.transport.send(message);
  }

  /**
   * Returns true if a remote follow message originates from a different pathname
   * on the same host (in Domain Lobby mode).
   */
  private isDifferentPath(remotePathname?: string): boolean {
    if (!remotePathname || typeof window === "undefined" || !window.location) {
      return false;
    }
    return window.location.pathname !== remotePathname;
  }

  /**
   * Safely navigates the follower's tab to the leader's new URL on the exact same origin,
   * persisting the follow state across page reload so cursor & scroll resume immediately.
   */
  private navigateToLeaderUrl(
    leaderUrl: string,
    following: FollowPeerInfo,
  ): void {
    if (typeof window === "undefined" || !window.location) {
      return;
    }

    try {
      const target = new URL(leaderUrl, window.location.origin);
      // Security: strictly enforce same-origin navigation so peers can never redirect off-site
      if (target.origin !== window.location.origin) {
        return;
      }
      if (target.href === window.location.href) {
        return;
      }

      this.savePendingFollow(following);
      window.location.assign(target.href);
    } catch {
      // Ignore malformed URLs
    }
  }

  private savePendingFollow(following: FollowPeerInfo): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(
          PENDING_FOLLOW_STORAGE_KEY,
          JSON.stringify({
            roomId: this.roomId,
            leaderId: following.peerId,
            leaderAvatar: following.avatar,
            savedAt: Date.now(),
          }),
        );
      }
    } catch {
      // Ignore storage errors
    }
  }

  private clearPendingFollow(): void {
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(PENDING_FOLLOW_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private restorePendingFollowIfAny(): void {
    try {
      if (typeof sessionStorage === "undefined") {
        return;
      }
      const raw = sessionStorage.getItem(PENDING_FOLLOW_STORAGE_KEY);
      if (!raw) {
        return;
      }
      sessionStorage.removeItem(PENDING_FOLLOW_STORAGE_KEY);
      const parsed = JSON.parse(raw) as {
        roomId?: string;
        leaderId?: string;
        leaderAvatar?: string;
        savedAt?: number;
      };
      if (
        parsed.roomId === this.roomId &&
        parsed.leaderId &&
        parsed.leaderId !== this.peerId &&
        parsed.savedAt &&
        Date.now() - parsed.savedAt <= PENDING_FOLLOW_TTL_MS
      ) {
        this.followUser(parsed.leaderId, parsed.leaderAvatar || "🐸");
      }
    } catch {
      // Ignore malformed storage data
    }
  }

  /**
   * Broadcasts live cursor position to followers.
   */
  private broadcastCursor(
    coords: {
      clientX: number;
      clientY: number;
      pageX: number;
      pageY: number;
      isHovering: boolean;
    },
    isClicking = false,
  ): void {
    if (typeof window === "undefined" || this.isDestroyed) {
      return;
    }

    const winW = window.innerWidth || 1;
    const winH = window.innerHeight || 1;
    const anchor = captureCursorAnchor(coords.clientX, coords.clientY);

    const message: FollowCursorMessage = {
      type: "FOLLOW_CURSOR",
      roomId: this.roomId,
      leaderId: this.peerId,
      leaderAvatar: this.avatar,
      pathname: window.location?.pathname,
      elementSelector: anchor?.selector,
      elementOffsetX: anchor?.offsetXRatio,
      elementOffsetY: anchor?.offsetYRatio,
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
   * Reads the current viewport (or inner container) scroll position + DOM anchor and broadcasts to followers.
   */
  public broadcastCurrentScroll(
    scrollTarget?: EventTarget | null,
    isSettled = true,
  ): void {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      this.isDestroyed
    ) {
      return;
    }

    const doc = document.documentElement || document.body;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    const maxScrollX = Math.max(0, doc.scrollWidth - window.innerWidth);
    const maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);

    const scrollPercentageX = maxScrollX > 0 ? scrollX / maxScrollX : 0;
    const scrollPercentageY = maxScrollY > 0 ? scrollY / maxScrollY : 0;

    // Only compute DOM content anchor when settled (or for inner containers) to avoid mid-scroll jitter
    const scrollAnchor =
      isSettled || (scrollTarget && scrollTarget instanceof Element)
        ? captureScrollAnchor(scrollTarget)
        : {};

    const message: FollowScrollMessage = {
      type: "FOLLOW_SCROLL",
      roomId: this.roomId,
      leaderId: this.peerId,
      url: window.location?.href,
      pathname: window.location?.pathname,
      anchorSelector: scrollAnchor.anchorSelector,
      anchorTopRatio: scrollAnchor.anchorTopRatio,
      containerSelector: scrollAnchor.containerSelector,
      containerScrollPctY: scrollAnchor.containerScrollPctY,
      containerScrollPctX: scrollAnchor.containerScrollPctX,
      isSettled,
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
   * Applies remote scroll position with jitter-free continuous tracking during scroll,
   * exact DOM-element alignment on settle, and smooth delta-time exponential gliding.
   */
  private applyRemoteScroll(msg: FollowScrollMessage): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    // 1. Inner scrollable container (Notion, Jira, Gmail, sidebars, modals)
    if (msg.containerSelector) {
      const container = resolveElementSelector(msg.containerSelector);
      if (container) {
        const maxY = Math.max(0, container.scrollHeight - container.clientHeight);
        const maxX = Math.max(0, container.scrollWidth - container.clientWidth);
        this.targetContainerEl = container;
        this.targetContainerY =
          typeof msg.containerScrollPctY === "number"
            ? Math.round(msg.containerScrollPctY * maxY)
            : container.scrollTop;
        this.targetContainerX =
          typeof msg.containerScrollPctX === "number"
            ? Math.round(msg.containerScrollPctX * maxX)
            : container.scrollLeft;
        this.isApplyingRemoteScroll = true;
        this.ensureSmoothScrollLoopRunning();
        return;
      }
    }

    this.targetContainerEl = null;

    const doc = document.documentElement || document.body;
    const localMaxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
    const localMaxScrollX = Math.max(0, doc.scrollWidth - window.innerWidth);

    // Base monotonic target (zero jumping while leader is actively scrolling)
    let targetY =
      msg.maxScrollY > 0 && Math.abs(msg.maxScrollY - localMaxScrollY) > 40
        ? Math.round(msg.scrollPercentageY * localMaxScrollY)
        : msg.scrollY;
    let targetX =
      msg.maxScrollX > 0 && Math.abs(msg.maxScrollX - localMaxScrollX) > 40
        ? Math.round(msg.scrollPercentageX * localMaxScrollX)
        : msg.scrollX;

    // 2. When leader settles (or on initial join), snap smoothly to the exact DOM anchor element
    // so both users land on the exact same heading/paragraph regardless of display width.
    if (
      msg.isSettled &&
      msg.anchorSelector &&
      typeof msg.anchorTopRatio === "number"
    ) {
      const anchorEl = resolveElementSelector(msg.anchorSelector);
      if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        const currentScrollY = window.scrollY || window.pageYOffset || 0;
        const desiredTop = msg.anchorTopRatio * window.innerHeight;
        const anchoredY = Math.round(currentScrollY + (rect.top - desiredTop));
        // Only apply anchor correction if reasonable (prevents wild jumps on dynamic ads/headers)
        if (Math.abs(anchoredY - targetY) < window.innerHeight * 1.25) {
          targetY = anchoredY;
        }
      }
    }

    this.targetScrollY = Math.max(0, Math.min(targetY, localMaxScrollY));
    this.targetScrollX = Math.max(0, Math.min(targetX, localMaxScrollX));

    this.isApplyingRemoteScroll = true;
    this.ensureSmoothScrollLoopRunning();
  }

  /**
   * Starts a single uninterrupted delta-time exponential smoothing RAF loop.
   * Never cancels/restarts RAF on incoming packets, eliminating mid-scroll stutter on 60Hz/120Hz/144Hz displays.
   */
  private ensureSmoothScrollLoopRunning(): void {
    if (
      typeof window === "undefined" ||
      typeof requestAnimationFrame === "undefined"
    ) {
      if (this.targetContainerEl) {
        this.targetContainerEl.scrollTop = this.targetContainerY;
        this.targetContainerEl.scrollLeft = this.targetContainerX;
      } else {
        try {
          window.scrollTo({
            top: this.targetScrollY,
            left: this.targetScrollX,
            behavior: "auto",
          });
        } catch {
          window.scrollTo(this.targetScrollX, this.targetScrollY);
        }
      }
      return;
    }

    // Already running: it will smoothly chase the updated target on the very next frame!
    if (this.smoothScrollRafId !== null) {
      return;
    }

    this.smoothScrollLastFrameTime = performance.now();

    const step = (now: number) => {
      if (this.isDestroyed) {
        this.isApplyingRemoteScroll = false;
        this.smoothScrollRafId = null;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - this.smoothScrollLastFrameTime) / 1000));
      this.smoothScrollLastFrameTime = now;
      // Frame-rate-independent exponential smoothing factor (~16/s responsiveness)
      const alpha = 1 - Math.exp(-16 * dt);

      if (this.targetContainerEl) {
        const currY = this.targetContainerEl.scrollTop;
        const currX = this.targetContainerEl.scrollLeft;
        const diffY = this.targetContainerY - currY;
        const diffX = this.targetContainerX - currX;

        if (Math.abs(diffY) < 1 && Math.abs(diffX) < 1) {
          this.targetContainerEl.scrollTop = this.targetContainerY;
          this.targetContainerEl.scrollLeft = this.targetContainerX;
          this.smoothScrollRafId = null;
          this.scheduleRemoteScrollFlagReset();
          return;
        }

        this.targetContainerEl.scrollTop = currY + diffY * alpha;
        this.targetContainerEl.scrollLeft = currX + diffX * alpha;
        this.smoothScrollRafId = requestAnimationFrame(step);
        return;
      }

      const currentY = window.scrollY || window.pageYOffset || 0;
      const currentX = window.scrollX || window.pageXOffset || 0;

      const diffY = this.targetScrollY - currentY;
      const diffX = this.targetScrollX - currentX;

      if (Math.abs(diffY) < 1 && Math.abs(diffX) < 1) {
        window.scrollTo({
          top: this.targetScrollY,
          left: this.targetScrollX,
          behavior: "auto",
        });
        this.smoothScrollRafId = null;
        this.scheduleRemoteScrollFlagReset();
        return;
      }

      window.scrollTo({
        top: currentY + diffY * alpha,
        left: currentX + diffX * alpha,
        behavior: "auto",
      });
      this.smoothScrollRafId = requestAnimationFrame(step);
    };

    this.smoothScrollRafId = requestAnimationFrame(step);
  }

  private scheduleRemoteScrollFlagReset(): void {
    if (this.remoteScrollResetTimer) {
      clearTimeout(this.remoteScrollResetTimer);
    }
    this.remoteScrollResetTimer = setTimeout(() => {
      this.isApplyingRemoteScroll = false;
    }, 80);
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

  private notifySelectionChange(selection: FollowSelectionState | null): void {
    for (const listener of this.selectionListeners) {
      try {
        listener(selection);
      } catch (err) {
        console.error("[WebRoom Follow] Error in selection listener:", err);
      }
    }
  }
}
