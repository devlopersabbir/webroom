import { ChatManager, ChatMessagesListener } from "../chat/chat";
import { ChatMessage } from "../chat/chat-protocol";
import {
  FollowCursorListener,
  FollowCursorState,
  FollowManager,
  FollowSelectionListener,
  FollowStateListener,
} from "../follow/follow-manager";
import { FollowPeerInfo } from "../follow/follow-store";
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

export interface Participant {
  peerId: string;
  avatar: string;
  isSelf: boolean;
}

export type ParticipantsListener = (participants: Participant[]) => void;

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
  private readonly followManager: FollowManager;

  private constructor(
    url: string,
    canonicalUrl: string,
    roomId: string,
    peerId: string,
    avatar: string,
    presenceManager: PresenceManager,
    chatManager: ChatManager,
    voiceManager: VoiceManager,
    followManager: FollowManager
  ) {
    this.url = url;
    this.canonicalUrl = canonicalUrl;
    this.roomId = roomId;
    this.peerId = peerId;
    this.avatar = avatar;
    this.presenceManager = presenceManager;
    this.chatManager = chatManager;
    this.voiceManager = voiceManager;
    this.followManager = followManager;
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

    const presenceManager = new PresenceManager(roomId, peerId, transport, undefined, avatar);
    const chatManager = new ChatManager(roomId, peerId, avatar, transport);
    const voiceManager = new VoiceManager(roomId, peerId, transport);
    const followManager = new FollowManager(roomId, peerId, avatar, transport);

    // Wire presence lifecycle to WebRTC voice mesh negotiation and follow cleanup
    presenceManager.onPeerJoin((remotePeerId) => {
      voiceManager.handlePeerDiscovered(remotePeerId);
    });

    presenceManager.onPeerLeave((remotePeerId) => {
      voiceManager.handlePeerLeft(remotePeerId);
      followManager.handlePeerLeft(remotePeerId);
    });

    presenceManager.start();
    chatManager.start();
    voiceManager.start();
    followManager.start();

    return new Room(
      url,
      canonicalUrl,
      roomId,
      peerId,
      avatar,
      presenceManager,
      chatManager,
      voiceManager,
      followManager
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
   * Snapshot of all active participants in this room (self + remote peers).
   */
  public getParticipants(): Participant[] {
    const selfParticipant: Participant = {
      peerId: this.peerId,
      avatar: this.avatar,
      isSelf: true,
    };

    const remoteParticipants: Participant[] = this.presenceManager.getPeers().map((peer) => ({
      peerId: peer.peerId,
      avatar: peer.avatar || "🐸",
      isSelf: false,
    }));

    return [selfParticipant, ...remoteParticipants];
  }

  /**
   * Subscribes to participant list updates (joins, leaves, heartbeats).
   */
  public onParticipantsChange(listener: ParticipantsListener): () => void {
    const emit = () => listener(this.getParticipants());

    const unsubscribeCount = this.presenceManager.onCountChange(() => emit());
    const unsubscribeJoin = this.presenceManager.onPeerJoin(() => emit());
    const unsubscribeLeave = this.presenceManager.onPeerLeave(() => emit());

    emit();

    return () => {
      unsubscribeCount();
      unsubscribeJoin();
      unsubscribeLeave();
    };
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
   * Starts following a remote participant.
   */
  public followUser(leaderId: string, leaderAvatar: string = "🐸"): void {
    this.followManager.followUser(leaderId, leaderAvatar);
  }

  /**
   * Stops following the current leader.
   */
  public unfollowUser(): void {
    this.followManager.unfollowUser();
  }

  /**
   * Returns the current leader being followed, or null.
   */
  public getFollowing(): FollowPeerInfo | null {
    return this.followManager.getFollowing();
  }

  /**
   * Returns all active remote peers following this user.
   */
  public getFollowers(): Map<string, FollowPeerInfo> {
    return this.followManager.getFollowers();
  }

  /**
   * Subscribes to changes in follow relationships.
   */
  public onFollowChange(listener: FollowStateListener): () => void {
    return this.followManager.onStateChange(listener);
  }

  /**
   * Returns the current leader's live cursor state, or null.
   */
  public getLeaderCursor(): FollowCursorState | null {
    return this.followManager.getLeaderCursor();
  }

  /**
   * Subscribes to live mouse cursor updates from the leader.
   */
  public onFollowCursor(listener: FollowCursorListener): () => void {
    return this.followManager.onCursorChange(listener);
  }

  /**
   * Subscribes to live selection updates from the leader.
   */
  public onFollowSelection(listener: FollowSelectionListener): () => void {
    return this.followManager.onSelectionChange(listener);
  }

  /**
   * Leaves the room, announcing departure to peers and releasing all resources.
   */
  public leave(): void {
    this.followManager.destroy();
    this.voiceManager.destroy();
    this.presenceManager.destroy();
    this.chatManager.destroy();
  }
}



