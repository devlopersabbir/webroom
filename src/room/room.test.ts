import { describe, expect, it } from "vitest";
import { PresenceMessage } from "../presence/protocol";
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

  public broadcast(sender: MockTransport, message: PresenceMessage): void {
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

  public send(message: PresenceMessage): void {
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

  public receive(message: PresenceMessage): void {
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

describe("PresenceManager Multi-Peer Simulation", () => {
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

  it("isolates different rooms on different URLs", async () => {
    const bus = new MockBus();

    const tabA = await Room.join("https://example.com/page-1", {
      customPeerId: "peer_A",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    const tabB = await Room.join("https://example.com/page-2", {
      customPeerId: "peer_B",
      transportFactory: (roomId) => new MockTransport(roomId, bus),
    });

    expect(tabA.getOnlineCount()).toBe(1);
    expect(tabB.getOnlineCount()).toBe(1);

    tabA.leave();
    tabB.leave();
  });
});
