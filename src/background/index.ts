import { getExtensionRuntime } from "./runtime";
import { initWebSocketRelayBridge } from "./ws-relay";
import { initAutoUpdater } from "./auto-updater";

/**
 * WebRoom Background Service Worker / Extension Background Script.
 * Coordinates CSP-immune WebSocket relay connections and automatic background updates.
 */
const runtime = getExtensionRuntime();

if (runtime) {
  initWebSocketRelayBridge(runtime);
  initAutoUpdater(runtime);
}
