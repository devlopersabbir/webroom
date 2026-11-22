import { SelectionRect } from "./follow-protocol";

export interface CursorAnchor {
  selector: string;
  offsetXRatio: number;
  offsetYRatio: number;
}

export interface ScrollAnchor {
  /** Selector of a visible content element near the top-third of the viewport */
  anchorSelector?: string;
  /** Anchor element's top offset as a ratio of viewport height */
  anchorTopRatio?: number;
  /** Selector of an inner scrollable container (if not scrolling window) */
  containerSelector?: string;
  /** Scroll progress (0..1) inside the inner scrollable container */
  containerScrollPctY?: number;
  containerScrollPctX?: number;
}

export interface SelectionAnchor {
  selector?: string;
  startOffset?: number;
}

const WEBROOM_ROOT_ID = "webroom-extension-root";
const MAX_SELECTOR_DEPTH = 6;

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([^\w-])/g, "\\$1");
}

function isUniqueSelector(selector: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function isWebRoomElement(el: Element | null): boolean {
  let curr: Element | null = el;
  while (curr) {
    if (curr.id === WEBROOM_ROOT_ID) return true;
    curr = curr.parentElement;
  }
  return false;
}

/**
 * Generates a compact, resilient CSS selector for a DOM element that works
 * reliably across different viewport widths and responsive layouts.
 */
export function buildElementSelector(el: Element | null): string {
  if (!el || typeof document === "undefined" || isWebRoomElement(el)) {
    return "";
  }

  if (el === document.body) return "body";
  if (el === document.documentElement) return "html";

  // 1. Prefer unique element ID
  if (el.id && el.id.length <= 80 && !/^\d/.test(el.id)) {
    const idSel = `#${cssEscape(el.id)}`;
    if (isUniqueSelector(idSel)) {
      return idSel;
    }
  }

  // 2. Prefer stable semantic attributes (data-testid, data-id, aria-label, name, href)
  const stableAttrs = ["data-testid", "data-test-id", "data-id", "data-issue-key", "name"];
  for (const attr of stableAttrs) {
    const val = el.getAttribute(attr);
    if (val && val.length > 0 && val.length <= 120) {
      const attrSel = `${el.tagName.toLowerCase()}[${attr}="${cssEscape(val)}"]`;
      if (isUniqueSelector(attrSel)) {
        return attrSel;
      }
    }
  }

  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    if (href && href.length > 0 && href.length <= 160 && !href.startsWith("javascript:")) {
      const hrefSel = `a[href="${cssEscape(href)}"]`;
      if (isUniqueSelector(hrefSel)) {
        return hrefSel;
      }
    }
  }

  // 3. Walk up the DOM tree building a short structural path
  const segments: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && current !== document.body && current !== document.documentElement && depth < MAX_SELECTOR_DEPTH) {
    // Stop early if an ancestor has a unique ID or data-testid
    if (current !== el) {
      if (current.id && current.id.length <= 80 && !/^\d/.test(current.id)) {
        const idSel = `#${cssEscape(current.id)}`;
        if (isUniqueSelector(idSel)) {
          segments.unshift(idSel);
          break;
        }
      }
      const testId = current.getAttribute("data-testid");
      if (testId && testId.length <= 120) {
        const testSel = `[data-testid="${cssEscape(testId)}"]`;
        if (isUniqueSelector(testSel)) {
          segments.unshift(testSel);
          break;
        }
      }
    }

    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.tagName === current!.tagName,
    );

    if (sameTagSiblings.length === 1) {
      segments.unshift(tag);
    } else {
      const index = sameTagSiblings.indexOf(current) + 1;
      segments.unshift(`${tag}:nth-of-type(${index})`);
    }

    current = parent;
    depth++;
  }

  return segments.join(" > ");
}

/**
 * Safely resolves a CSS selector back to a DOM Element.
 */
export function resolveElementSelector(selector?: string): Element | null {
  if (!selector || typeof document === "undefined") {
    return null;
  }
  try {
    const el = document.querySelector(selector);
    if (el && !isWebRoomElement(el)) {
      return el;
    }
  } catch {
    // Ignore invalid selectors
  }
  return null;
}

/**
 * Captures the DOM element directly under the leader's cursor and the cursor's
 * normalized (0..1) offset inside that element's bounding box.
 */
export function captureCursorAnchor(
  clientX: number,
  clientY: number,
): CursorAnchor | null {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
    return null;
  }

  const el = document.elementFromPoint(clientX, clientY);
  if (!el || el === document.body || el === document.documentElement || isWebRoomElement(el)) {
    return null;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const selector = buildElementSelector(el);
  if (!selector) {
    return null;
  }

  const offsetXRatio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const offsetYRatio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

  return {
    selector,
    offsetXRatio: Number(offsetXRatio.toFixed(4)),
    offsetYRatio: Number(offsetYRatio.toFixed(4)),
  };
}

/**
 * Resolves a leader's cursor position on the follower's viewport using the
 * element anchor first (display-width independent), falling back to viewport percentage.
 */
export function resolveCursorPosition(
  anchor: {
    selector?: string;
    offsetXRatio?: number;
    offsetYRatio?: number;
  },
  fallbackPercentageX: number,
  fallbackPercentageY: number,
): { clientX: number; clientY: number; elementRect?: SelectionRect } {
  const winW = typeof window !== "undefined" ? window.innerWidth || 1 : 1;
  const winH = typeof window !== "undefined" ? window.innerHeight || 1 : 1;

  if (anchor.selector) {
    const el = resolveElementSelector(anchor.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const rx = typeof anchor.offsetXRatio === "number" ? anchor.offsetXRatio : 0.5;
        const ry = typeof anchor.offsetYRatio === "number" ? anchor.offsetYRatio : 0.5;
        return {
          clientX: Math.round(rect.left + rx * rect.width),
          clientY: Math.round(rect.top + ry * rect.height),
          elementRect: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      }
    }
  }

  return {
    clientX: Math.round(fallbackPercentageX * winW),
    clientY: Math.round(fallbackPercentageY * winH),
  };
}

function isFixedOrSticky(el: Element): boolean {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return false;
  }
  let curr: Element | null = el;
  let hops = 0;
  while (curr && curr !== document.body && curr !== document.documentElement && hops < 5) {
    const pos = window.getComputedStyle(curr).position;
    if (pos === "fixed" || pos === "sticky") {
      return true;
    }
    curr = curr.parentElement;
    hops++;
  }
  return false;
}

/**
 * Captures a scroll anchor: either an inner scrollable container or a visible
 * non-fixed content element near the middle of the viewport.
 */
export function captureScrollAnchor(scrollTarget?: EventTarget | null): ScrollAnchor {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {};
  }

  // Case 1: Inner scrollable container (e.g. Notion, Jira, Gmail, sidebars, modals)
  if (
    scrollTarget &&
    scrollTarget instanceof Element &&
    scrollTarget !== document.documentElement &&
    scrollTarget !== document.body &&
    !isWebRoomElement(scrollTarget)
  ) {
    const maxY = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
    const maxX = Math.max(0, scrollTarget.scrollWidth - scrollTarget.clientWidth);
    if (maxY > 20 || maxX > 20) {
      const containerSelector = buildElementSelector(scrollTarget);
      if (containerSelector) {
        return {
          containerSelector,
          containerScrollPctY: maxY > 0 ? Number((scrollTarget.scrollTop / maxY).toFixed(4)) : 0,
          containerScrollPctX: maxX > 0 ? Number((scrollTarget.scrollLeft / maxX).toFixed(4)) : 0,
        };
      }
    }
  }

  // Case 2: Main window scroll -> pick a visible, non-fixed content anchor element
  if (typeof document.elementFromPoint !== "function") {
    return {};
  }

  const probePoints: Array<[number, number]> = [
    [window.innerWidth * 0.5, window.innerHeight * 0.35],
    [window.innerWidth * 0.35, window.innerHeight * 0.45],
    [window.innerWidth * 0.5, window.innerHeight * 0.55],
  ];

  for (const [px, py] of probePoints) {
    const el = document.elementFromPoint(px, py);
    if (
      !el ||
      el === document.body ||
      el === document.documentElement ||
      isWebRoomElement(el) ||
      isFixedOrSticky(el)
    ) {
      continue;
    }

    const rect = el.getBoundingClientRect();
    // Skip huge full-page wrappers; prefer focused content blocks
    if (rect.height <= 4 || rect.height > window.innerHeight * 1.2) {
      continue;
    }

    const selector = buildElementSelector(el);
    if (selector) {
      const topRatio = window.innerHeight > 0 ? rect.top / window.innerHeight : 0;
      return {
        anchorSelector: selector,
        anchorTopRatio: Number(topRatio.toFixed(4)),
      };
    }
  }

  return {};
}

/**
 * Captures the DOM container selector & character offset for the leader's current text selection.
 */
export function captureSelectionAnchor(sel: Selection): SelectionAnchor {
  if (!sel || sel.rangeCount === 0) {
    return {};
  }
  try {
    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const containerEl =
      common.nodeType === 1 ? (common as Element) : common.parentElement;
    if (!containerEl || isWebRoomElement(containerEl)) {
      return {};
    }
    const selector = buildElementSelector(containerEl);
    const fullText = containerEl.textContent || "";
    const selected = sel.toString().trim();
    const startOffset = selected ? fullText.indexOf(selected) : -1;
    return {
      selector: selector || undefined,
      startOffset: startOffset >= 0 ? startOffset : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Resolves a leader's text selection into exact wrapped DOM client rects on the follower's layout.
 */
export function resolveSelectionRects(
  selectedText: string,
  selector?: string,
  startOffset?: number,
): SelectionRect[] {
  if (
    !selectedText ||
    typeof document === "undefined" ||
    typeof document.createTreeWalker !== "function"
  ) {
    return [];
  }

  const root: Node = resolveElementSelector(selector) || document.body;
  if (!root) return [];

  const target = selectedText.trim();
  if (!target) return [];

  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Array<{ node: Text; start: number; end: number }> = [];
    let fullText = "";
    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      const val = textNode.nodeValue || "";
      const start = fullText.length;
      fullText += val;
      textNodes.push({ node: textNode, start, end: fullText.length });
      current = walker.nextNode();
    }

    let matchIndex = -1;
    if (
      typeof startOffset === "number" &&
      startOffset >= 0 &&
      fullText.slice(startOffset, startOffset + target.length) === target
    ) {
      matchIndex = startOffset;
    } else {
      matchIndex = fullText.indexOf(target);
    }

    if (matchIndex < 0) {
      return [];
    }

    const matchEnd = matchIndex + target.length;
    let startNode: Text | null = null;
    let startNodeOffset = 0;
    let endNode: Text | null = null;
    let endNodeOffset = 0;

    for (const entry of textNodes) {
      if (!startNode && matchIndex >= entry.start && matchIndex < entry.end) {
        startNode = entry.node;
        startNodeOffset = matchIndex - entry.start;
      }
      if (matchEnd > entry.start && matchEnd <= entry.end) {
        endNode = entry.node;
        endNodeOffset = matchEnd - entry.start;
        break;
      }
    }

    if (!startNode || !endNode) {
      return [];
    }

    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);

    const rects: SelectionRect[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width > 1 && r.height > 1) {
        rects.push({
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        });
      }
    }
    return rects;
  } catch {
    return [];
  }
}
