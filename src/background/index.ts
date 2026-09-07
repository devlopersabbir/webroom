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

  if (runtime.onInstalled) {
    runtime.onInstalled.addListener((details: any) => {
      if (details.reason === "install") {
        try {
          if (runtime.openOptionsPage) {
            runtime.openOptionsPage();
          }
        } catch (err) {
          console.warn("[WebRoom Background] Failed to open options page on install:", err);
        }
      }
    });
  }
}
