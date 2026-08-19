import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageHandler, Transport } from "../transport/transport";
import { FollowManager } from "./follow-manager";
import {
  FollowMessage,
  FollowScrollMessage,
  FollowStartMessage,
  isValidFollowMessage,
} from "./follow-protocol";
import { FollowStore } from "./follow-store";

class SimpleMockTransport implements Transport {
  public sent: FollowMessage[] = [];
  private handlers = new Set<MessageHandler>();

  public start(): void {}
  public send(message: FollowMessage): void {
    this.sent.push(message);
  }
  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  public emitMessage(message: FollowMessage): void {
    for (const h of this.handlers) h(message);
  }
  public close(): void {
    this.handlers.clear();
  }
}

describe("Follow Protocol Validation", () => {
  it("validates well-formed follow start messages", () => {
    const msg: FollowStartMessage = {
      type: "FOLLOW_START",
      roomId: "room_1",
      followerId: "peer_follower",
      followerAvatar: "🐸",
      leaderId: "peer_leader",
      timestamp: Date.now(),
    };

    expect(isValidFollowMessage(msg)).toBe(true);
    expect(isValidFollowMessage(msg, "room_1")).toBe(true);
    expect(isValidFollowMessage(msg, "other_room")).toBe(false);
  });

  it("validates well-formed follow scroll messages", () => {
    const msg: FollowScrollMessage = {
      type: "FOLLOW_SCROLL",
      roomId: "room_1",
      leaderId: "peer_leader",
      scrollX: 0,
      scrollY: 450,
      maxScrollX: 0,
      maxScrollY: 1000,
      scrollPercentageX: 0,
      scrollPercentageY: 0.45,
      timestamp: Date.now(),
    };

    expect(isValidFollowMessage(msg)).toBe(true);
    expect(isValidFollowMessage(msg, "room_1")).toBe(true);
  });

  it("rejects invalid follow messages", () => {
    expect(isValidFollowMessage(null)).toBe(false);
    expect(isValidFollowMessage({})).toBe(false);
    expect(isValidFollowMessage({ type: "UNKNOWN", roomId: "r", timestamp: 123 })).toBe(false);
    expect(
      isValidFollowMessage({
        type: "FOLLOW_START",
        roomId: "",
        followerId: "f",
        followerAvatar: "🐸",
        leaderId: "l",
        timestamp: 123,
      })
    ).toBe(false);
  });
});

describe("FollowStore", () => {
  let store: FollowStore;

  beforeEach(() => {
    store = new FollowStore();
  });

  it("tracks single following leader and switches leader", () => {
    expect(store.getFollowing()).toBeNull();
    expect(store.isFollowing("leader_1")).toBe(false);

    store.setFollowing("leader_1", "🦊");
    expect(store.getFollowing()).toEqual({ peerId: "leader_1", avatar: "🦊" });
    expect(store.isFollowing("leader_1")).toBe(true);

    // Switch to leader 2
    store.setFollowing("leader_2", "🐼");
    expect(store.getFollowing()).toEqual({ peerId: "leader_2", avatar: "🐼" });
    expect(store.isFollowing("leader_1")).toBe(false);
    expect(store.isFollowing("leader_2")).toBe(true);

    store.clearFollowing();
    expect(store.getFollowing()).toBeNull();
  });

  it("tracks multiple followers fan-out", () => {
    expect(store.getFollowerCount()).toBe(0);

    const isNew1 = store.addFollower("peer_A", "🐸");
    const isNew2 = store.addFollower("peer_B", "🐼");

    expect(isNew1).toBe(true);
    expect(isNew2).toBe(true);
    expect(store.getFollowerCount()).toBe(2);

    expect(store.getFollowers().get("peer_A")?.avatar).toBe("🐸");
    expect(store.getFollowers().get("peer_B")?.avatar).toBe("🐼");

    store.removeFollower("peer_A");
    expect(store.getFollowerCount()).toBe(1);
    expect(store.getFollowers().has("peer_A")).toBe(false);
    expect(store.getFollowers().has("peer_B")).toBe(true);
  });
});

describe("FollowManager Coordination", () => {
  it("follows a leader, sends FOLLOW_START, and receives follow scroll", () => {
    const transport = new SimpleMockTransport();
    const manager = new FollowManager("room_1", "peer_follower", "🐸", transport);
    manager.start();

    // Start following leader 🦊
    manager.followUser("peer_leader", "🦊");
    expect(manager.getFollowing()).toEqual({ peerId: "peer_leader", avatar: "🦊" });

    expect(transport.sent.length).toBe(1);
    expect(transport.sent[0]).toMatchObject({
      type: "FOLLOW_START",
      roomId: "room_1",
      followerId: "peer_follower",
      followerAvatar: "🐸",
      leaderId: "peer_leader",
    });

    // Unfollow
    manager.unfollowUser();
    expect(manager.getFollowing()).toBeNull();
    expect(transport.sent.length).toBe(2);
    expect(transport.sent[1]).toMatchObject({
      type: "FOLLOW_STOP",
      roomId: "room_1",
      followerId: "peer_follower",
      leaderId: "peer_leader",
    });

    manager.destroy();
  });

  it("handles remote peer disconnect while following", () => {
    const transport = new SimpleMockTransport();
    const manager = new FollowManager("room_1", "peer_follower", "🐸", transport);
    manager.start();

    manager.followUser("peer_leader", "🦊");
    expect(manager.getFollowing()?.peerId).toBe("peer_leader");

    // Leader disconnects
    manager.handlePeerLeft("peer_leader");
    expect(manager.getFollowing()).toBeNull();

    manager.destroy();
  });

  it("automatically terminates follow when leader sends FOLLOW_NAVIGATE", () => {
    const transport = new SimpleMockTransport();
    const manager = new FollowManager("room_1", "peer_follower", "🐸", transport);
    manager.start();

    manager.followUser("peer_leader", "🦊");
    expect(manager.getFollowing()?.peerId).toBe("peer_leader");

    // Leader navigated away
    transport.emitMessage({
      type: "FOLLOW_NAVIGATE",
      roomId: "room_1",
      leaderId: "peer_leader",
      timestamp: Date.now(),
    });

    // Follower must terminate follow without navigating
    expect(manager.getFollowing()).toBeNull();

    manager.destroy();
  });

  it("prevents self-following", () => {
    const transport = new SimpleMockTransport();
    const manager = new FollowManager("room_1", "peer_self", "🐸", transport);
    manager.start();

    manager.followUser("peer_self", "🐸");
    expect(manager.getFollowing()).toBeNull();
    expect(transport.sent.length).toBe(0);

    manager.destroy();
  });

  it("switches leaders automatically by stopping prior leader before following new leader", () => {
    const transport = new SimpleMockTransport();
    const manager = new FollowManager("room_1", "peer_follower", "🐸", transport);
    manager.start();

    manager.followUser("leader_A", "🦊");
    expect(manager.getFollowing()?.peerId).toBe("leader_A");
    expect(transport.sent.length).toBe(1);
    expect(transport.sent[0].type).toBe("FOLLOW_START");

    // Switch to leader B
    manager.followUser("leader_B", "🐼");
    expect(manager.getFollowing()?.peerId).toBe("leader_B");
    expect(transport.sent.length).toBe(3);

    // Sent FOLLOW_STOP for A then FOLLOW_START for B
    expect(transport.sent[1]).toMatchObject({
      type: "FOLLOW_STOP",
      leaderId: "leader_A",
    });
    expect(transport.sent[2]).toMatchObject({
      type: "FOLLOW_START",
      leaderId: "leader_B",
    });

    manager.destroy();
  });

  it("broadcasts FOLLOW_NAVIGATE when a leader with active followers is destroyed", () => {
    const transport = new SimpleMockTransport();
    const leaderManager = new FollowManager("room_1", "peer_leader", "🦊", transport);
    leaderManager.start();

    // Remote peer follows leader
    transport.emitMessage({
      type: "FOLLOW_START",
      roomId: "room_1",
      followerId: "peer_follower_1",
      followerAvatar: "🐸",
      leaderId: "peer_leader",
      timestamp: Date.now(),
    });

    expect(leaderManager.getFollowers().size).toBe(1);

    // Leader leaves / navigates
    leaderManager.destroy();

    const navMsg = transport.sent.find((m) => m.type === "FOLLOW_NAVIGATE");
    expect(navMsg).toBeDefined();
    expect(navMsg).toMatchObject({
      type: "FOLLOW_NAVIGATE",
      roomId: "room_1",
      leaderId: "peer_leader",
    });
  });

  it("broadcasts and receives FOLLOW_CURSOR messages with hover and click state", () => {
    const transport = new SimpleMockTransport();
    const followerManager = new FollowManager("room_1", "peer_follower", "🐸", transport);
    followerManager.start();

    // Start following leader 🦊
    followerManager.followUser("peer_leader", "🦊");

    let receivedCursor: any = null;
    followerManager.onCursorChange((cursor) => {
      receivedCursor = cursor;
    });

    // Leader moves cursor and hovers a button
    transport.emitMessage({
      type: "FOLLOW_CURSOR",
      roomId: "room_1",
      leaderId: "peer_leader",
      leaderAvatar: "🦊",
      clientX: 320,
      clientY: 480,
      pageX: 320,
      pageY: 980,
      percentageX: 0.25,
      percentageY: 0.48,
      isHovering: true,
      isClicking: true,
      timestamp: Date.now(),
    });

    expect(receivedCursor).not.toBeNull();
    expect(receivedCursor.clientX).toBe(320);
    expect(receivedCursor.clientY).toBe(480);
    expect(receivedCursor.isHovering).toBe(true);
    expect(receivedCursor.isClicking).toBe(true);
    expect(receivedCursor.leaderAvatar).toBe("🦊");

    followerManager.destroy();
  });

  it("broadcasts and receives FOLLOW_SELECTION messages", () => {
    const transport = new SimpleMockTransport();
    const followerManager = new FollowManager("room_1", "peer_follower", "🐸", transport);
    followerManager.start();

    followerManager.followUser("peer_leader", "🦊");

    let receivedSelection: any = null;
    followerManager.onSelectionChange((sel) => {
      receivedSelection = sel;
    });

    // Leader selects text
    transport.emitMessage({
      type: "FOLLOW_SELECTION",
      roomId: "room_1",
      leaderId: "peer_leader",
      leaderAvatar: "🦊",
      selectedText: "Hello WebRoom Live Follow!",
      timestamp: Date.now(),
    });

    expect(receivedSelection).not.toBeNull();
    expect(receivedSelection.selectedText).toBe("Hello WebRoom Live Follow!");

    followerManager.destroy();
  });
});


