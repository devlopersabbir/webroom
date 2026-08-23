import { describe, expect, it } from "vitest";
import { MemoryIdentityStorage } from "../identity/identity-store";
import { ResourceManager } from "./resource-manager";

describe("ResourceManager Subsystem (WebRoom v3 Phase 3)", () => {
  it("initializes with voluntary contribution enabled by default", async () => {
    const storage = new MemoryIdentityStorage();
    const manager = await ResourceManager.initialize(storage);

    expect(manager.isContributionEnabled()).toBe(true);
    const caps = manager.getCapabilities();
    expect(caps.contributionEnabled).toBe(true);
    expect(caps.maxRelaySlots).toBe(2);
    expect(caps.availableRelaySlots).toBe(2);
    expect(caps.activeRelays).toBe(0);
  });

  it("persists user preferences when toggling contribution ON and OFF", async () => {
    const storage = new MemoryIdentityStorage();
    const manager1 = await ResourceManager.initialize(storage);

    await manager1.setContributionEnabled(false);
    expect(manager1.isContributionEnabled()).toBe(false);
    expect(manager1.getCapabilities().maxRelaySlots).toBe(0);
    expect(manager1.getCapabilities().availableRelaySlots).toBe(0);

    // Re-initialize from storage
    const manager2 = await ResourceManager.initialize(storage);
    expect(manager2.isContributionEnabled()).toBe(false);

    // Re-enable
    await manager2.setContributionEnabled(true);
    expect(manager2.isContributionEnabled()).toBe(true);
    expect(manager2.getCapabilities().maxRelaySlots).toBe(2);
  });

  it("strictly enforces relay slot budget limits", async () => {
    const storage = new MemoryIdentityStorage();
    const manager = await ResourceManager.initialize(storage, { maxRelaySlots: 2 });

    // Reserve slot 1
    const r1 = manager.reserveRelaySlot();
    expect(r1).toBe(true);
    expect(manager.getCapabilities().activeRelays).toBe(1);
    expect(manager.getCapabilities().availableRelaySlots).toBe(1);

    // Reserve slot 2
    const r2 = manager.reserveRelaySlot();
    expect(r2).toBe(true);
    expect(manager.getCapabilities().activeRelays).toBe(2);
    expect(manager.getCapabilities().availableRelaySlots).toBe(0);

    // Reserve slot 3 (should fail due to capacity limit)
    const r3 = manager.reserveRelaySlot();
    expect(r3).toBe(false);
    expect(manager.getCapabilities().activeRelays).toBe(2);

    // Release slot
    manager.releaseRelaySlot();
    expect(manager.getCapabilities().activeRelays).toBe(1);
    expect(manager.getCapabilities().availableRelaySlots).toBe(1);

    // Now slot 3 can succeed
    const r4 = manager.reserveRelaySlot();
    expect(r4).toBe(true);
    expect(manager.getCapabilities().activeRelays).toBe(2);
  });

  it("rejects relay reservation when contribution is disabled", async () => {
    const storage = new MemoryIdentityStorage();
    const manager = await ResourceManager.initialize(storage);

    await manager.setContributionEnabled(false);
    const reserved = manager.reserveRelaySlot();
    expect(reserved).toBe(false);
  });

  it("notifies subscribers when capabilities change", async () => {
    const storage = new MemoryIdentityStorage();
    const manager = await ResourceManager.initialize(storage);

    const changes: boolean[] = [];
    manager.onCapabilitiesChange((caps) => {
      changes.push(caps.contributionEnabled);
    });

    await manager.setContributionEnabled(false);
    await manager.setContributionEnabled(true);

    expect(changes).toContain(false);
    expect(changes).toContain(true);
  });
});
