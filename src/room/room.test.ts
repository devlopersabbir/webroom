import { describe, expect, it } from "vitest";
import { WebRoomMessage } from "../presence/protocol";
import { MessageHandler, Transport } from "../transport/transport";
import { Room } from "./room";

/**
 * In-memory Mock Transport bus connecting virtual peers in test environment.
 */
class MockBus {
  private channels = new Map<string, Set<MockTransport>>();

  public register(roomId: string, transport: MockTransport): void {
    if (!this.channels.has(roomId)) {
      this.channels.set(roomId, new Set());
    }
    this.channels.get(roomId)!.add(transport);
  }

  public unregister(roomId: string, transport: MockTransport): void {
    const list = this.channels.get(roomId);
    if (list) {
      list.delete(transport);
    }
  }

  public broadcast(sender: MockTransport, message: WebRoomMessage): void {
    const peers = this.channels.get(message.roomId);
    if (!peers) return;

    for (const peer of peers) {
      if (peer !== sender) {
        peer.receive(message);
      }
    }
  }
}

class MockTransport implements Transport {
  private handlers = new Set<MessageHandler>();
  private closed = false;

  constructor(
    private roomId: string,
    private bus: MockBus
  ) {}

  public start(): void {
    if (!this.closed) {
      this.bus.register(this.roomId, this);
    }
  }

  public send(message: WebRoomMessage): void {
    if (!this.closed) {
      this.bus.broadcast(this, message);
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public receive(message: WebRoomMessage): void {
    if (this.closed) return;
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  public close(): void {
    this.closed = true;
    this.bus.unregister(this.roomId, this);
    this.handlers.clear();
  }
}

describe("Room Multi-Peer Presence & Chat Simulation", () => {
  it("coordinates 1, 2, 3 peers and handles graceful goodbye", async () => {
    const bus = new MockBus();
    const url = "https://youtube.com/watch?v=ABC123";

    // Tab A joins
    const tabA = await Room.join(url, {
      customPeerId: "peer_A",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getOnlineCount()).toBe(1);

    // Tab B joins
    const tabB = await Room.join(url, {
      customPeerId: "peer_B",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getOnlineCount()).toBe(2);
    expect(tabB.getOnlineCount()).toBe(2);

    // Tab C joins
    const tabC = await Room.join(url, {
      customPeerId: "peer_C",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getOnlineCount()).toBe(3);
    expect(tabB.getOnlineCount()).toBe(3);
    expect(tabC.getOnlineCount()).toBe(3);

    // Tab C leaves gracefully
    tabC.leave();

    expect(tabA.getOnlineCount()).toBe(2);
    expect(tabB.getOnlineCount()).toBe(2);

    // Tab B leaves gracefully
    tabB.leave();

    expect(tabA.getOnlineCount()).toBe(1);

    tabA.leave();
  });

  it("exchanges real-time ephemeral chat messages among peers in the same room", async () => {
    const bus = new MockBus();
    const url = "https://example.com/shared-doc";

    const tabA = await Room.join(url, {
      customPeerId: "peer_A",
      customAvatar: "🐸",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    const tabB = await Room.join(url, {
      customPeerId: "peer_B",
      customAvatar: "🦊",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getMessages().length).toBe(0);
    expect(tabB.getMessages().length).toBe(0);

    // Peer A sends a message
    const msg1 = tabA.sendMessage("Hello from Peer A! 👋");
    expect(msg1).not.toBeNull();
    expect(tabA.getMessages().length).toBe(1);
    expect(tabB.getMessages().length).toBe(1);
    expect(tabB.getMessages()[0].text).toBe("Hello from Peer A! 👋");
    expect(tabB.getMessages()[0].avatar).toBe("🐸");

    // Peer B sends a reply
    const msg2 = tabB.sendMessage("Hey A! Nice room 🚀");
    expect(msg2).not.toBeNull();
    expect(tabA.getMessages().length).toBe(2);
    expect(tabB.getMessages().length).toBe(2);
    expect(tabA.getMessages()[1].text).toBe("Hey A! Nice room 🚀");
    expect(tabA.getMessages()[1].avatar).toBe("🦊");

    tabA.leave();
    tabB.leave();
  });

  it("isolates different rooms on different URLs for presence and chat", async () => {
    const bus = new MockBus();

    const tabA = await Room.join("https://example.com/page-1", {
      customPeerId: "peer_A",
      customAvatar: "🐸",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    const tabB = await Room.join("https://example.com/page-2", {
      customPeerId: "peer_B",
      customAvatar: "🦊",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getOnlineCount()).toBe(1);
    expect(tabB.getOnlineCount()).toBe(1);

    tabA.sendMessage("Secret message in Page 1");
    expect(tabA.getMessages().length).toBe(1);
    expect(tabB.getMessages().length).toBe(0);

    tabA.leave();
    tabB.leave();
  });

  it("tracks participant list with avatars across multiple peers", async () => {
    const bus = new MockBus();
    const url = "https://example.com/team-room";

    const tabA = await Room.join(url, {
      customPeerId: "peer_A",
      customAvatar: "🐸",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getParticipants()).toEqual([
      { peerId: "peer_A", avatar: "🐸", isSelf: true },
    ]);

    const tabB = await Room.join(url, {
      customPeerId: "peer_B",
      customAvatar: "🦊",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    const participantsA = tabA.getParticipants();
    expect(participantsA.length).toBe(2);
    expect(participantsA[0]).toEqual({ peerId: "peer_A", avatar: "🐸", isSelf: true });
    expect(participantsA[1]).toEqual({ peerId: "peer_B", avatar: "🦊", isSelf: false });

    tabA.leave();
    tabB.leave();
  });

  it("coordinates follow mode between rooms and handles follow/unfollow", async () => {
    const bus = new MockBus();
    const url = "https://example.com/follow-room";

    const leaderTab = await Room.join(url, {
      customPeerId: "leader_fox",
      customAvatar: "🦊",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    const followerTab = await Room.join(url, {
      customPeerId: "follower_frog",
      customAvatar: "🐸",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(followerTab.getFollowing()).toBeNull();
    expect(leaderTab.getFollowers().size).toBe(0);

    // Follower follows leader
    followerTab.followUser("leader_fox", "🦊");

    expect(followerTab.getFollowing()).toEqual({ peerId: "leader_fox", avatar: "🦊" });
    expect(leaderTab.getFollowers().get("follower_frog")?.avatar).toBe("🐸");

    // Follower stops following
    followerTab.unfollowUser();
    expect(followerTab.getFollowing()).toBeNull();
    expect(leaderTab.getFollowers().has("follower_frog")).toBe(false);

    leaderTab.leave();
    followerTab.leave();
  });
});


