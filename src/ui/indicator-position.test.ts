import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clampPosition,
  computePanelPlacement,
  getDefaultIndicatorPosition,
  loadSavedIndicatorPosition,
  saveIndicatorPosition,
  STORAGE_KEY_INDICATOR_POS,
} from "./indicator-position";

describe("Indicator Position & Clamping", () => {
  const viewport = { width: 1000, height: 800 };
  const pillWidth = 100;
  const pillHeight = 34;

  it("clamps position within viewport margins", () => {
    // Out of bounds on left and top
    const clamped1 = clampPosition({ x: -50, y: -20 }, pillWidth, pillHeight, viewport, 16);
    expect(clamped1).toEqual({ x: 16, y: 16 });

    // Out of bounds on right and bottom
    const clamped2 = clampPosition({ x: 1200, y: 900 }, pillWidth, pillHeight, viewport, 16);
    expect(clamped2).toEqual({ x: 1000 - 100 - 16, y: 800 - 34 - 16 });

    // In bounds remains unchanged
    const clamped3 = clampPosition({ x: 300, y: 400 }, pillWidth, pillHeight, viewport, 16);
    expect(clamped3).toEqual({ x: 300, y: 400 });
  });

  it("calculates default bottom-right indicator position correctly", () => {
    const def = getDefaultIndicatorPosition(pillWidth, pillHeight, viewport, 20);
    expect(def).toEqual({
      x: 1000 - 100 - 20,
      y: 800 - 34 - 20,
    });
  });
});

describe("Panel Placement Calculation", () => {
  const viewport = { width: 1440, height: 900 };
  const pillWidth = 100;
  const pillHeight = 34;

  it("places panel above pill when pill is near bottom-right (default position)", () => {
    const pillPos = { x: 1300, y: 840 };
    const placement = computePanelPlacement(pillPos, pillWidth, pillHeight, viewport, 12, 10);

    expect(placement.verticalAlign).toBe("bottom"); // panel is placed above pill, anchored at bottom
    expect(placement.horizontalAlign).toBe("right"); // panel is aligned to the right edge
    expect(placement.transformOrigin).toBe("bottom right");
    expect(placement.width).toBe(360);
    expect(placement.height).toBe(520);
    expect(placement.top).toBe(840 - 10 - 520); // 310
    expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width - 12);
  });

  it("places panel below pill when pill is near top-left", () => {
    const pillPos = { x: 20, y: 20 };
    const placement = computePanelPlacement(pillPos, pillWidth, pillHeight, viewport, 12, 10);

    expect(placement.verticalAlign).toBe("top"); // panel opens downwards below the pill
    expect(placement.horizontalAlign).toBe("left");
    expect(placement.transformOrigin).toBe("top left");
    expect(placement.top).toBe(20 + 34 + 10); // 64
    expect(placement.left).toBe(20);
  });

  it("places panel below pill and right-aligned when pill is near top-right", () => {
    const pillPos = { x: 1300, y: 20 };
    const placement = computePanelPlacement(pillPos, pillWidth, pillHeight, viewport, 12, 10);

    expect(placement.verticalAlign).toBe("top");
    expect(placement.horizontalAlign).toBe("right");
    expect(placement.transformOrigin).toBe("top right");
    expect(placement.top).toBe(20 + 34 + 10);
    expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width - 12);
  });

  it("places panel above pill and left-aligned when pill is near bottom-left", () => {
    const pillPos = { x: 20, y: 840 };
    const placement = computePanelPlacement(pillPos, pillWidth, pillHeight, viewport, 12, 10);

    expect(placement.verticalAlign).toBe("bottom");
    expect(placement.horizontalAlign).toBe("left");
    expect(placement.transformOrigin).toBe("bottom left");
    expect(placement.top).toBe(840 - 10 - 520);
    expect(placement.left).toBe(20);
  });

  it("restricts dimensions responsibly on smaller viewports", () => {
    const smallViewport = { width: 350, height: 400 };
    const placement = computePanelPlacement({ x: 50, y: 300 }, pillWidth, pillHeight, smallViewport, 12, 8);

    expect(placement.width).toBeLessThanOrEqual(smallViewport.width);
    expect(placement.height).toBeLessThanOrEqual(smallViewport.height);
    expect(placement.top).toBeGreaterThanOrEqual(12);
    expect(placement.left).toBeGreaterThanOrEqual(12);
  });
});

describe("LocalStorage Persistence", () => {
  const originalLocalStorage = (globalThis as any).localStorage;
  const memoryStore = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, val: string) => memoryStore.set(key, val),
    removeItem: (key: string) => memoryStore.delete(key),
    clear: () => memoryStore.clear(),
  };

  beforeEach(() => {
    memoryStore.clear();
    (globalThis as any).localStorage = mockStorage;
  });

  afterEach(() => {
    if (originalLocalStorage !== undefined) {
      (globalThis as any).localStorage = originalLocalStorage;
    } else {
      delete (globalThis as any).localStorage;
    }
  });

  it("saves and loads indicator position safely", () => {
    const testPos = { x: 250, y: 450 };
    saveIndicatorPosition(testPos);

    const loaded = loadSavedIndicatorPosition();
    expect(loaded).toEqual(testPos);
  });

  it("handles corrupted or empty localStorage data gracefully", () => {
    mockStorage.setItem(STORAGE_KEY_INDICATOR_POS, "invalid json");
    expect(loadSavedIndicatorPosition()).toBeNull();

    mockStorage.setItem(STORAGE_KEY_INDICATOR_POS, JSON.stringify({ x: "invalid", y: null }));
    expect(loadSavedIndicatorPosition()).toBeNull();
  });
});
