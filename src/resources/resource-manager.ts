import { IdentityStorage, UniversalIdentityStorage } from "../identity/identity-store";
import {
  DEFAULT_RESOURCE_BUDGET,
  NodeCapabilities,
  ResourceBudget,
} from "./resource-budget";

const RESOURCE_SHARING_STORAGE_KEY = "webroom_v3_resource_sharing_enabled";

export type CapabilitiesChangeListener = (capabilities: NodeCapabilities) => void;

/**
 * WebRoom v3 — Resource Manager
 * 
 * Manages voluntary user resource contribution, enforces hard upper limits on
 * relay connections and bandwidth, and advertises node capabilities to the overlay.
 */
export class ResourceManager {
  private readonly storage: IdentityStorage;
  private readonly budget: ResourceBudget;
  private contributionEnabled: boolean;
  private activeRelays = 0;
  private bytesUsedInWindow = 0;
  private bandwidthWindowStart = Date.now();
  private readonly listeners = new Set<CapabilitiesChangeListener>();

  private constructor(
    storage: IdentityStorage,
    budget: ResourceBudget,
    contributionEnabled: boolean
  ) {
    this.storage = storage;
    this.budget = budget;
    this.contributionEnabled = contributionEnabled;
  }

  /**
   * Initializes the ResourceManager and restores persisted contribution preferences.
   */
  public static async initialize(
    storage: IdentityStorage = new UniversalIdentityStorage(),
    customBudget: Partial<ResourceBudget> = {}
  ): Promise<ResourceManager> {
    const budget: ResourceBudget = {
      ...DEFAULT_RESOURCE_BUDGET,
      ...customBudget,
    };

    let contributionEnabled = true; // Default ON as per v3 specification
    try {
      const stored = await storage.get(RESOURCE_SHARING_STORAGE_KEY);
      if (stored !== null) {
        contributionEnabled = stored === "true" || stored === "1";
      }
    } catch (err) {
      console.warn("[WebRoom Resources] Could not read contribution preference from storage:", err);
    }

    return new ResourceManager(storage, budget, contributionEnabled);
  }

  /**
   * Returns whether the user has voluntary resource contribution enabled.
   */
  public isContributionEnabled(): boolean {
    return this.contributionEnabled;
  }

  /**
   * Updates user resource contribution preference and persists to local storage.
   */
  public async setContributionEnabled(enabled: boolean): Promise<void> {
    this.contributionEnabled = enabled;

    // If disabled, reset active relay assignments immediately
    if (!enabled) {
      this.activeRelays = 0;
    }

    try {
      await this.storage.set(RESOURCE_SHARING_STORAGE_KEY, enabled ? "true" : "false");
    } catch (err) {
      console.warn("[WebRoom Resources] Failed to persist contribution preference:", err);
    }

    this.notifyListeners();
  }

  /**
   * Returns current static resource budget configuration.
   */
  public getBudget(): ResourceBudget {
    return { ...this.budget };
  }

  /**
   * Calculates live node capabilities and remaining capacity.
   */
  public getCapabilities(): NodeCapabilities {
    const maxRelaySlots = this.contributionEnabled ? this.budget.maxRelaySlots : 0;
    const availableRelaySlots = Math.max(0, maxRelaySlots - this.activeRelays);

    // Calculate approximate bandwidth in rolling 1-second window
    const now = Date.now();
    const elapsedSeconds = Math.max(0.1, (now - this.bandwidthWindowStart) / 1000);
    const currentBandwidthKbps = Math.round((this.bytesUsedInWindow * 8) / (elapsedSeconds * 1000));

    // Reset window periodically
    if (elapsedSeconds >= 1.0) {
      this.bytesUsedInWindow = 0;
      this.bandwidthWindowStart = now;
    }

    return {
      contributionEnabled: this.contributionEnabled,
      maxRelaySlots,
      activeRelays: this.activeRelays,
      availableRelaySlots,
      networkBudgetKbps: this.budget.networkBudgetKbps,
      currentBandwidthKbps,
    };
  }

  /**
   * Attempts to reserve a relay slot for forwarding media to a downstream peer.
   * @returns true if slot was successfully reserved, false if capacity is exhausted.
   */
  public reserveRelaySlot(): boolean {
    if (!this.contributionEnabled) {
      return false;
    }

    if (this.activeRelays >= this.budget.maxRelaySlots) {
      return false;
    }

    this.activeRelays += 1;
    this.notifyListeners();
    return true;
  }

  /**
   * Releases an active relay slot when a downstream peer disconnects or route changes.
   */
  public releaseRelaySlot(): void {
    if (this.activeRelays > 0) {
      this.activeRelays -= 1;
      this.notifyListeners();
    }
  }

  /**
   * Records outbound media/packet bytes for heuristic bandwidth tracking.
   */
  public recordBandwidthUsage(bytes: number): void {
    if (bytes > 0) {
      this.bytesUsedInWindow += bytes;
    }
  }

  /**
   * Subscribes to live capability and capacity changes.
   */
  public onCapabilitiesChange(listener: CapabilitiesChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getCapabilities());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const caps = this.getCapabilities();
    for (const listener of this.listeners) {
      try {
        listener(caps);
      } catch (err) {
        console.error("[WebRoom Resources] Error in capabilities listener:", err);
      }
    }
  }
}
