import ReactDOM from "react-dom/client";
import { Room } from "../room/room";
import { getRoomId, RoomScope } from "../room/room-id";
import { getRandomAvatar, SESSION_AVATAR_STORAGE_KEY } from "../shared/constants";
import { installWebSocketBridge } from "../transport/background-ws-bridge";
import { installWebRTCBridge } from "../transport/safe-webrtc";
import { INDICATOR_STYLES } from "../ui/indicator-styles";
import { WebRoomIndicator } from "../ui/WebRoomIndicator";
import { UrlListener } from "./url-listener";

/**
 * Returns a stable emoji avatar for the current browser tab across page reloads.
 */
function getTabSessionAvatar(): string {
  try {
    if (typeof sessionStorage !== "undefined") {
      const existing = sessionStorage.getItem(SESSION_AVATAR_STORAGE_KEY);
      if (existing && existing.trim().length > 0) {
        return existing;
      }
      const fresh = getRandomAvatar();
      sessionStorage.setItem(SESSION_AVATAR_STORAGE_KEY, fresh);
      return fresh;
    }
  } catch {
    // Fallback if sessionStorage is restricted on the host page
  }
  return getRandomAvatar();
}

/**
 * WebRoom Content Script Entry Point.
 * Mounts the isolated floating indicator into a Shadow DOM container
 * and coordinates room transitions on navigation.
 */
function initWebRoomContentScript(): void {
  // Only run in the top-level frame of actual web pages (avoid sandboxed/about:blank iframes)
  try {
    if (typeof window === "undefined" || !window.location) return;
    if (window.location.protocol !== "https:") return;
    if (window.top !== window) return;
  } catch {
    return;
  }

  // Ensure WebSocket and WebRTC bridges are active before any networking is attempted
  installWebSocketBridge();
  installWebRTCBridge();

  // Prevent multiple initializations on the same document
  const HOST_ID = "webroom-extension-root";
  if (document.getElementById(HOST_ID)) {
    return;
  }

  // Create Shadow DOM host element
  const hostElement = document.createElement("div");
  hostElement.id = HOST_ID;
  hostElement.style.position = "fixed";
  hostElement.style.zIndex = "2147483647";
  hostElement.style.inset = "0";
  hostElement.style.width = "100vw";
  hostElement.style.height = "100vh";
  hostElement.style.overflow = "visible";
  hostElement.style.pointerEvents = "none";

  const shadowRoot = hostElement.attachShadow({ mode: "open" });

  // Inject scoped styles
  const styleEl = document.createElement("style");
  styleEl.textContent = INDICATOR_STYLES;
  shadowRoot.appendChild(styleEl);

  // Mount point for React
  const mountPoint = document.createElement("div");
  mountPoint.id = "webroom-mount";
  mountPoint.style.position = "fixed";
  mountPoint.style.inset = "0";
  mountPoint.style.width = "100vw";
  mountPoint.style.height = "100vh";
  mountPoint.style.pointerEvents = "none";
  mountPoint.style.overflow = "visible";
  shadowRoot.appendChild(mountPoint);

  const root = ReactDOM.createRoot(mountPoint);

  let currentRoom: Room | null = null;
  let activeJoinSeq = 0;
  const currentScope: RoomScope = "domain";
  const tabAvatar = getTabSessionAvatar();
  const urlListener = new UrlListener();

  async function joinCurrentRoom(url: string): Promise<void> {
    const seq = ++activeJoinSeq;

    try {
      const nextRoomId = await getRoomId(url, currentScope);
      if (seq !== activeJoinSeq) {
        return; // Superseded by a newer navigation event
      }

      // SPA path change on the same host: stay connected without dropping voice/chat/files
      if (currentRoom && currentRoom.roomId === nextRoomId) {
        currentRoom.updateCurrentUrl(url);
        return;
      }

      if (currentRoom) {
        currentRoom.leave();
        currentRoom = null;
      }

      const room = await Room.join(url, {
        scope: currentScope,
        customAvatar: tabAvatar,
      });

      if (seq !== activeJoinSeq) {
        room.leave();
        return;
      }

      currentRoom = room;
      root.render(<WebRoomIndicator room={room} />);
    } catch (err) {
      console.error("[WebRoom] Failed to join room for URL:", url, err);
    }
  }

  // Attach to DOM once document body is ready
  function mountToDom(): void {
    const target = document.body || document.documentElement;
    if (target) {
      target.appendChild(hostElement);
      joinCurrentRoom(window.location.href);
      urlListener.start();
    } else {
      window.addEventListener("DOMContentLoaded", mountToDom, { once: true });
    }
  }

  mountToDom();

  // Handle SPA / navigation URL changes
  urlListener.onChange(async (newUrl) => {
    joinCurrentRoom(newUrl);
  });

  // Handle page unload / close
  const cleanup = () => {
    urlListener.stop();
    if (currentRoom) {
      currentRoom.leave();
      currentRoom = null;
    }
  };

  window.addEventListener("pagehide", cleanup);
  window.addEventListener("beforeunload", cleanup);
}

initWebRoomContentScript();
