/**
 * In-memory state tracking for active follow relationships in a room.
 * Follow model: A user follows at most one leader, while a leader can have multiple followers.
 */

export interface FollowPeerInfo {
  peerId: string;
  avatar: string;
}

export class FollowStore {
  // The single leader the current user is following (or null if not following anyone)
  private followingLeader: FollowPeerInfo | null = null;

  // The set of remote peers following the current user
  private followers = new Map<string, FollowPeerInfo>();

  /**
   * Sets or updates the leader the current user is following.
   */
  public setFollowing(leaderId: string, avatar: string = "🐸"): void {
    this.followingLeader = {
      peerId: leaderId,
      avatar,
    };
  }

  /**
   * Clears the current following leader.
   * @returns The previous leader if there was one, or null.
   */
  public clearFollowing(): FollowPeerInfo | null {
    const prev = this.followingLeader;
    this.followingLeader = null;
    return prev;
  }

  /**
   * Returns the current leader being followed, or null.
   */
  public getFollowing(): FollowPeerInfo | null {
    return this.followingLeader ? { ...this.followingLeader } : null;
  }

  /**
   * Checks if the user is currently following a specific peerId.
   */
  public isFollowing(leaderId: string): boolean {
    return this.followingLeader !== null && this.followingLeader.peerId === leaderId;
  }

  /**
   * Adds a remote follower.
   * @returns `true` if this follower was newly added.
   */
  public addFollower(followerId: string, avatar: string = "🐸"): boolean {
    const isNew = !this.followers.has(followerId);
    this.followers.set(followerId, {
      peerId: followerId,
      avatar,
    });
    return isNew;
  }

  /**
   * Removes a remote follower.
   * @returns `true` if the follower existed and was removed.
   */
  public removeFollower(followerId: string): boolean {
    return this.followers.delete(followerId);
  }

  /**
   * Returns all active remote followers as a Map.
   */
  public getFollowers(): Map<string, FollowPeerInfo> {
    return new Map(this.followers);
  }

  /**
   * Returns the count of peers currently following this user.
   */
  public getFollowerCount(): number {
    return this.followers.size;
  }

  /**
   * Resets all following and follower state.
   */
  public clear(): void {
    this.followingLeader = null;
    this.followers.clear();
  }
}
