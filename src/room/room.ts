import { ChatManager, ChatMessagesListener } from "../chat/chat";
import { ChatMessage } from "../chat/chat-protocol";
import { PresenceCountListener, PresenceManager } from "../presence/presence";
import { getRandomAvatar } from "../shared/constants";
import { BroadcastChannelTransport } from "../transport/broadcast-channel";
import { Transport } from "../transport/transport";
import {
  SpeakingPeersListener,
  VoiceManager,
  VoiceState,
  VoiceStateListener,
} from "../voice/voice-manager";
import { canonicalizeUrl, getRoomId } from "./room-id";

export interface RoomOptions {
  transportFactory?: (roomId: string) => Transport;
  customPeerId?: string;
  customAvatar?: string;
}

/**
 * Generates a temporary unique peer ID for the current browser context.
 */
export function generatePeerId(): string {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15);
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
  public readonly avatar: string;
  private readonly presenceManager: PresenceManager;
  private readonly chatManager: ChatManager;
  private readonly voiceManager: VoiceManager;

  private constructor(
    url: string,
    canonicalUrl: string,
    roomId: string,
    peerId: string,
    avatar: string,
    presenceManager: PresenceManager,
    chatManager: ChatManager,
    voiceManager: VoiceManager
  ) {
    this.url = url;
    this.canonicalUrl = canonicalUrl;
    this.roomId = roomId;
    this.peerId = peerId;
    this.avatar = avatar;
    this.presenceManager = presenceManager;
    this.chatManager = chatManager;
    this.voiceManager = voiceManager;
  }

  /**
   * Initializes and joins a room for the given webpage URL.
   */
  public static async join(url: string, options: RoomOptions = {}): Promise<Room> {
    const canonicalUrl = canonicalizeUrl(url);
    const roomId = await getRoomId(canonicalUrl);
    const peerId = options.customPeerId || generatePeerId();
    const avatar = options.customAvatar || getRandomAvatar();

    const transport = options.transportFactory
      ? options.transportFactory(roomId)
      : new BroadcastChannelTransport(roomId);

    const presenceManager = new PresenceManager(roomId, peerId, transport);
    const chatManager = new ChatManager(roomId, peerId, avatar, transport);
    const voiceManager = new VoiceManager(roomId, peerId, transport);

    // Wire presence lifecycle to WebRTC voice mesh negotiation
    presenceManager.onPeerJoin((remotePeerId) => {
      voiceManager.handlePeerDiscovered(remotePeerId);
    });

    presenceManager.onPeerLeave((remotePeerId) => {
      voiceManager.handlePeerLeft(remotePeerId);
    });

    presenceManager.start();
    chatManager.start();
    voiceManager.start();

    return new Room(
      url,
      canonicalUrl,
      roomId,
      peerId,
      avatar,
      presenceManager,
      chatManager,
      voiceManager
    );
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
   * Snapshot of all ephemeral chat messages in this room.
   */
  public getMessages(): ChatMessage[] {
    return this.chatManager.getMessages();
  }

  /**
   * Sends an ephemeral chat message to all peers on this page.
   */
  public sendMessage(text: string): ChatMessage | null {
    return this.chatManager.sendMessage(text);
  }

  /**
   * Subscribes to chat message updates in this room.
   */
  public onMessagesChange(listener: ChatMessagesListener): () => void {
    return this.chatManager.onMessagesChange(listener);
  }

  /**
   * Current voice state (mic ON/OFF, speaker ON/OFF).
   */
  public getVoiceState(): VoiceState {
    return this.voiceManager.getState();
  }

  /**
   * Toggles microphone ON/OFF.
   */
  public async toggleMicrophone(): Promise<boolean> {
    return this.voiceManager.toggleMicrophone();
  }

  /**
   * Toggles speaker ON/OFF.
   */
  public toggleSpeaker(): boolean {
    return this.voiceManager.toggleSpeaker();
  }

  /**
   * Subscribes to voice state changes.
   */
  public onVoiceStateChange(listener: VoiceStateListener): () => void {
    return this.voiceManager.onStateChange(listener);
  }

  /**
   * Set of peer IDs currently speaking.
   */
  public getSpeakingPeers(): Set<string> {
    return this.voiceManager.getSpeakingPeers();
  }

  /**
   * Subscribes to changes in which peers are actively speaking.
   */
  public onSpeakingChange(listener: SpeakingPeersListener): () => void {
    return this.voiceManager.onSpeakingChange(listener);
  }

  /**
   * Leaves the room, announcing departure to peers and releasing all resources.
   */
  public leave(): void {
    this.voiceManager.destroy();
    this.presenceManager.destroy();
    this.chatManager.destroy();
  }
}

