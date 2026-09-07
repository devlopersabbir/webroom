import { ChatManager, ChatMessagesListener } from "../chat/chat";
import { ChatMessage } from "../chat/chat-protocol";
import {
  FollowCursorListener,
  FollowCursorState,
  FollowManager,
  FollowSelectionListener,
  FollowSelectionState,
  FollowStateListener,
} from "../follow/follow-manager";
import { FollowPeerInfo } from "../follow/follow-store";
import { PresenceCountListener, PresenceManager } from "../presence/presence";
import { NodeIdentity } from "../identity/node-identity";
import { MembershipManager } from "../membership/membership-manager";
import { ResourceManager } from "../resources/resource-manager";
import { RoleManager } from "../roles/role-manager";
import { NodeRole, RoleChangeListener } from "../roles/role-types";
import { MediaRoutingLayer } from "../routing/media-routing-layer";
import { RoutingPlan, RoutingPlanListener } from "../routing/routing-types";
import { getRandomAvatar } from "../shared/constants";
import { HybridTransport } from "../transport/hybrid-transport";
import { Transport } from "../transport/transport";
import {
  FileTransferManager,
  InboundStateListener,
  OutboundStateListener,
} from "../file-transfer/file-transfer-manager";
import {
  SpeakingPeersListener,
  VoiceManager,
  VoiceState,
  VoiceStateListener,
} from "../voice/voice-manager";
import { selfId } from "trystero";
import { canonicalizeUrl, getRoomId } from "./room-id";

export interface RoomOptions {
  transportFactory?: (roomId: string) => Transport;
  customPeerId?: string;
  customAvatar?: string;
  identity?: NodeIdentity;
  resourceManager?: ResourceManager;
}

export interface Participant {
  peerId: string;
  avatar: string;
  isSelf: boolean;
}

export type ParticipantsListener = (participants: Participant[]) => void;

/**
 * Generates a temporary unique peer ID for the current browser context.
 * Uses Trystero's selfId for 1-to-1 consistency with WebRTC transport.
 */
export function generatePeerId(): string {
  try {
    if (typeof selfId === "string" && selfId.length > 0) {
      return selfId;
    }
  } catch {
    // Fallback if selfId is unavailable in test environment
  }
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
  return `peer_${uuid.replace(/-/g, "").substring(0, 12)}`;
}

/**
 * WebRoom Room instance representing the active session for a specific canonical webpage URL.
 */
export class Room {
  public readonly url: string;
  public readonly canonicalUrl: string;
  public readonly roomId: string;
  public readonly peerId: string;
  public readonly avatar: string;
  public readonly identity: NodeIdentity;
  public readonly resourceManager: ResourceManager;
  public readonly membershipManager: MembershipManager;
  public readonly routingLayer: MediaRoutingLayer;
  public readonly fileTransferManager: FileTransferManager;
  private readonly transport: Transport;
  private readonly presenceManager: PresenceManager;
  private readonly chatManager: ChatManager;
  private readonly voiceManager: VoiceManager;
  private readonly followManager: FollowManager;
  private sendFileTarget: Participant | null = null;
  private sendFileTargetListeners = new Set<
    (target: Participant | null) => void
  >();

  private constructor(
    url: string,
    canonicalUrl: string,
    roomId: string,
    peerId: string,
    avatar: string,
    identity: NodeIdentity,
    resourceManager: ResourceManager,
    membershipManager: MembershipManager,
    routingLayer: MediaRoutingLayer,
    transport: Transport,
    presenceManager: PresenceManager,
    chatManager: ChatManager,
    voiceManager: VoiceManager,
    followManager: FollowManager,
    fileTransferManager: FileTransferManager,
  ) {
    this.url = url;
    this.canonicalUrl = canonicalUrl;
    this.roomId = roomId;
    this.peerId = peerId;
    this.avatar = avatar;
    this.identity = identity;
    this.resourceManager = resourceManager;
    this.membershipManager = membershipManager;
    this.routingLayer = routingLayer;
    this.transport = transport;
    this.presenceManager = presenceManager;
    this.chatManager = chatManager;
    this.voiceManager = voiceManager;
    this.followManager = followManager;
    this.fileTransferManager = fileTransferManager;
  }

  /**
   * Initializes and joins a room for the given webpage URL.
   */
  public static async join(
    url: string,
    options: RoomOptions = {},
  ): Promise<Room> {
    const canonicalUrl = canonicalizeUrl(url);
    const roomId = await getRoomId(canonicalUrl);
    const identity = options.identity || (await NodeIdentity.initialize());
    const resourceManager =
      options.resourceManager || (await ResourceManager.initialize());
    const peerId = options.customPeerId || generatePeerId();
    const avatar = options.customAvatar || getRandomAvatar();

    const transport = options.transportFactory
      ? options.transportFactory(roomId)
      : new HybridTransport(roomId);

    const presenceManager = new PresenceManager(
      roomId,
      peerId,
      transport,
      undefined,
      avatar,
    );
    const membershipManager = new MembershipManager(
      roomId,
      identity,
      peerId,
      transport,
      avatar,
      resourceManager,
    );
    const routingLayer = new MediaRoutingLayer();
    const chatManager = new ChatManager(roomId, peerId, avatar, transport);
    const voiceManager = new VoiceManager(roomId, peerId, transport);
    const followManager = new FollowManager(roomId, peerId, avatar, transport);
    const fileTransferManager = new FileTransferManager(
      roomId,
      peerId,
      avatar,
      transport,
    );

    // Wire presence lifecycle to WebRTC voice mesh negotiation, follow and file transfer cleanup
    presenceManager.onPeerJoin((remotePeerId) => {
      voiceManager.handlePeerDiscovered(remotePeerId);
    });

    presenceManager.onPeerLeave((remotePeerId) => {
      voiceManager.handlePeerLeft(remotePeerId);
      followManager.handlePeerLeft(remotePeerId);
      fileTransferManager.handlePeerLeft(remotePeerId);
    });

    // Wire membership updates to media routing layer for automatic route reassignment
    membershipManager.onMembershipChange((members) => {
      const activeSpeakers = new Set<string>();
      for (const m of members) {
        if (voiceManager.isPeerSpeaking(m.peerId)) {
          activeSpeakers.add(m.nodeId);
        }
      }
      routingLayer.computeRoutingPlan(members, activeSpeakers);
    });

    membershipManager.onNodeLeave((leftNode) => {
      routingLayer.handleNodeFailure(
        leftNode.nodeId,
        membershipManager.getMembers(),
        new Set(),
      );
    });

    presenceManager.start();
    membershipManager.start();
    chatManager.start();
    voiceManager.start();
    followManager.start();
    fileTransferManager.start();

    console.log(
      `[WebRoom] 🚪 Joined Room: ${roomId} (Node: ${identity.getNodeId()}, Peer: ${peerId}) for URL: ${canonicalUrl}`,
    );

    return new Room(
      url,
      canonicalUrl,
      roomId,
      peerId,
      avatar,
      identity,
      resourceManager,
      membershipManager,
      routingLayer,
      transport,
      presenceManager,
      chatManager,
      voiceManager,
      followManager,
      fileTransferManager,
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

    const remoteParticipants: Participant[] = this.presenceManager
      .getPeers()
      .map((peer) => ({
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
   * Returns the current leader's live text selection state, or null.
   */
  public getLeaderSelection(): FollowSelectionState | null {
    return this.followManager.getLeaderSelection();
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
   * Returns current role of this local node.
   */
  public getSelfRole(): NodeRole {
    return this.membershipManager.getSelfRole();
  }

  /**
   * Returns RoleManager instance for cluster role introspection.
   */
  public get roleManager(): RoleManager {
    return this.membershipManager.roleManager;
  }

  /**
   * Subscribes to cluster role assignments changes.
   */
  public onRoleChange(listener: RoleChangeListener): () => void {
    return this.membershipManager.roleManager.onRoleChange(listener);
  }

  /**
   * Returns current active media routing plan.
   */
  public getRoutingPlan(): RoutingPlan {
    return this.routingLayer.getRoutingPlan();
  }

  /**
   * Subscribes to media routing plan updates.
   */
  public onRoutingChange(listener: RoutingPlanListener): () => void {
    return this.routingLayer.onRouteChange(listener);
  }

  /**
   * Initiates a 1-to-1 direct peer-to-peer file transfer.
   */
  public requestSendFile(
    targetPeerId: string,
    targetAvatar: string,
    file: File,
  ): Promise<string> {
    return this.fileTransferManager.requestSendFile(
      targetPeerId,
      targetAvatar,
      file,
    );
  }

  /**
   * Accepts an incoming file transfer offer.
   */
  public acceptFileTransfer(transferId: string): void {
    this.fileTransferManager.acceptTransfer(transferId);
  }

  /**
   * Declines an incoming file transfer offer.
   */
  public rejectFileTransfer(transferId: string, reason?: string): void {
    this.fileTransferManager.rejectTransfer(transferId, reason);
  }

  /**
   * Cancels an active or pending file transfer.
   */
  public cancelFileTransfer(transferId: string, reason?: string): void {
    this.fileTransferManager.cancelTransfer(transferId, reason);
  }

  /**
   * Returns remaining rate-limit cooldown in ms for a target participant (0 if not blocked).
   */
  public getFileTransferCooldownRemaining(targetPeerId: string): number {
    return this.fileTransferManager.getRejectionCooldownMs(targetPeerId);
  }

  /**
   * Listens for changes in the outbound file transfer state.
   */
  public onOutboundFileTransferChange(
    listener: OutboundStateListener,
  ): () => void {
    return this.fileTransferManager.onOutboundChange(listener);
  }

  /**
   * Listens for changes in the inbound file transfer state.
   */
  public onInboundFileTransferChange(
    listener: InboundStateListener,
  ): () => void {
    return this.fileTransferManager.onInboundChange(listener);
  }

  /**
   * Sets the active remote participant for direct file sending.
   */
  public setSendFileTarget(target: Participant | null): void {
    this.sendFileTarget = target;
    for (const listener of this.sendFileTargetListeners) {
      listener(target);
    }
  }

  /**
   * Returns current active remote participant for direct file sending.
   */
  public getSendFileTarget(): Participant | null {
    return this.sendFileTarget;
  }

  /**
   * Subscribes to changes in active send file target.
   */
  public onSendFileTargetChange(
    listener: (target: Participant | null) => void,
  ): () => void {
    this.sendFileTargetListeners.add(listener);
    listener(this.sendFileTarget);
    return () => {
      this.sendFileTargetListeners.delete(listener);
    };
  }

  /**
   * Leaves the room, announcing departure to peers and releasing all resources.
   */
  public leave(sendGoodbye: boolean = true): void {
    this.fileTransferManager.destroy();
    this.routingLayer.destroy();
    this.membershipManager.destroy(sendGoodbye);
    this.followManager.destroy();
    this.voiceManager.destroy();
    this.presenceManager.destroy();
    this.chatManager.destroy();
  }
}
