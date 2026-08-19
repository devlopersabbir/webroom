import { PresenceCountListener, PresenceManager } from "../presence/presence";
import { BroadcastChannelTransport } from "../transport/broadcast-channel";
import { Transport } from "../transport/transport";
import { canonicalizeUrl, getRoomId } from "./room-id";

export interface RoomOptions {
  transportFactory?: (roomId: string) => Transport;
  customPeerId?: string;
}

/**
 * Generates a temporary unique peer ID for the current browser context.
 */
export function generatePeerId(): string {
  const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
  return `peer_${uuid}`;
}

/**
 * Represents an active WebRoom instance for a specific webpage URL.
 */
export class Room {
  public readonly url: string;
  public readonly canonicalUrl: string;
  public readonly roomId: string;
  public readonly peerId: string;
  private readonly presenceManager: PresenceManager;

  private constructor(
    url: string,
    canonicalUrl: string,
    roomId: string,
    peerId: string,
    presenceManager: PresenceManager
  ) {
    this.url = url;
    this.canonicalUrl = canonicalUrl;
    this.roomId = roomId;
    this.peerId = peerId;
    this.presenceManager = presenceManager;
  }

  /**
   * Initializes and joins a room for the given webpage URL.
   */
  public static async join(url: string, options: RoomOptions = {}): Promise<Room> {
    const canonicalUrl = canonicalizeUrl(url);
    const roomId = await getRoomId(canonicalUrl);
    const peerId = options.customPeerId || generatePeerId();

    const transport = options.transportFactory
      ? options.transportFactory(roomId)
      : new BroadcastChannelTransport(roomId);

    const presenceManager = new PresenceManager(roomId, peerId, transport);
    presenceManager.start();

    return new Room(url, canonicalUrl, roomId, peerId, presenceManager);
  }

  /**
   * Current online count for this room.
   */
  public getOnlineCount(): number {
    return this.presenceManager.getOnlineCount();
  }

  /**
   * Listens for changes in the room's online peer count.
   */
  public onCountChange(listener: PresenceCountListener): () => void {
    return this.presenceManager.onCountChange(listener);
  }

  /**
   * Leaves the room, announcing departure to peers and releasing all resources.
   */
  public leave(): void {
    this.presenceManager.destroy();
  }
}
