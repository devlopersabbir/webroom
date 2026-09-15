export interface Position {
  x: number;
  y: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface PanelPlacement {
  top: number;
  left: number;
  width: number;
  height: number;
  transformOrigin: string;
  verticalAlign: "top" | "bottom";
  horizontalAlign: "left" | "right";
}

export const STORAGE_KEY_INDICATOR_POS = "webroom_indicator_pos";
export const DEFAULT_MARGIN = 16;
export const DEFAULT_GAP = 10;
export const DEFAULT_PANEL_WIDTH = 360;
export const DEFAULT_PANEL_HEIGHT = 520;
export const DEFAULT_PILL_WIDTH = 96;
export const DEFAULT_PILL_HEIGHT = 34;

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    // Ignore security errors
  }
  return null;
}

/**
 * Clamps a given position inside the viewport taking item width/height and margin into account.
 */
export function clampPosition(
  pos: Position,
  itemWidth: number,
  itemHeight: number,
  viewport: ViewportDimensions,
  margin: number = DEFAULT_MARGIN
): Position {
  const maxX = Math.max(margin, viewport.width - itemWidth - margin);
  const maxY = Math.max(margin, viewport.height - itemHeight - margin);

  return {
    x: Math.min(Math.max(margin, Math.round(pos.x)), maxX),
    y: Math.min(Math.max(margin, Math.round(pos.y)), maxY),
  };
}

/**
 * Computes default bottom-right indicator position.
 */
export function getDefaultIndicatorPosition(
  pillWidth: number = DEFAULT_PILL_WIDTH,
  pillHeight: number = DEFAULT_PILL_HEIGHT,
  viewport: ViewportDimensions = {
    width: typeof window !== "undefined" ? window.innerWidth : 1440,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
  },
  offset: number = 20
): Position {
  return {
    x: Math.max(DEFAULT_MARGIN, viewport.width - pillWidth - offset),
    y: Math.max(DEFAULT_MARGIN, viewport.height - pillHeight - offset),
  };
}

/**
 * Computes the optimal position, size, and transform-origin of the WebRoomPanel
 * relative to the dragged pill position so it opens seamlessly from that location
 * and remains completely visible within the viewport.
 */
export function computePanelPlacement(
  pillPos: Position,
  pillWidth: number = DEFAULT_PILL_WIDTH,
  pillHeight: number = DEFAULT_PILL_HEIGHT,
  viewport: ViewportDimensions = {
    width: typeof window !== "undefined" ? window.innerWidth : 1440,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
  },
  margin: number = 12,
  gap: number = DEFAULT_GAP
): PanelPlacement {
  const width = Math.min(DEFAULT_PANEL_WIDTH, Math.max(280, viewport.width - margin * 2));
  const height = Math.min(DEFAULT_PANEL_HEIGHT, Math.max(300, viewport.height - 70));

  // Determine vertical placement:
  // If pill is in the bottom half of the screen, open ABOVE the pill.
  // If pill is in the top half of the screen, open BELOW the pill.
  const isBottomHalf = pillPos.y + pillHeight / 2 > viewport.height / 2;
  let top: number;
  let verticalAlign: "top" | "bottom";

  if (isBottomHalf) {
    top = pillPos.y - gap - height;
    verticalAlign = "bottom";
  } else {
    top = pillPos.y + pillHeight + gap;
    verticalAlign = "top";
  }

  // Ensure panel fits inside viewport vertically
  top = Math.max(margin, Math.min(top, viewport.height - height - margin));

  // Determine horizontal placement:
  // If pill is in the right half of the screen, right-align panel with pill.
  // If pill is in the left half of the screen, left-align panel with pill.
  const isRightHalf = pillPos.x + pillWidth / 2 > viewport.width / 2;
  let left: number;
  let horizontalAlign: "left" | "right";

  if (isRightHalf) {
    left = pillPos.x + pillWidth - width;
    horizontalAlign = "right";
  } else {
    left = pillPos.x;
    horizontalAlign = "left";
  }

  // Ensure panel fits inside viewport horizontally
  left = Math.max(margin, Math.min(left, viewport.width - width - margin));

  const transformOrigin = `${verticalAlign} ${horizontalAlign}`;

  return {
    top,
    left,
    width,
    height,
    transformOrigin,
    verticalAlign,
    horizontalAlign,
  };
}

/**
 * Loads saved pill position from localStorage with validation and fallback.
 */
export function loadSavedIndicatorPosition(): Position | null {
  try {
    const storage = getLocalStorage();
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY_INDICATOR_POS);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.x === "number" &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.y)
    ) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // Ignore storage errors (e.g. storage disabled in sandboxed environments)
  }
  return null;
}

/**
 * Saves pill position to localStorage safely.
 */
export function saveIndicatorPosition(pos: Position): void {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    storage.setItem(STORAGE_KEY_INDICATOR_POS, JSON.stringify(pos));
  } catch {
    // Ignore storage errors
  }
}
