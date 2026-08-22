/**
 * Proactive Auto-Update Handler for Firefox AMO & Chrome Web Store.
 * Automatically applies updates when available without requiring users to reinstall.
 */
export function initAutoUpdater(runtime: any): void {
  if (!runtime) return;

  if (runtime.onUpdateAvailable) {
    runtime.onUpdateAvailable.addListener((details: { version?: string }) => {
      console.log(
        `[WebRoom Auto-Update] New version available: ${details?.version || "latest"}. Applying update immediately...`,
      );
      if (typeof runtime.reload === "function") {
        runtime.reload();
      }
    });
  }

  function checkExtensionUpdates(): void {
    if (runtime && typeof runtime.requestUpdateCheck === "function") {
      try {
        runtime.requestUpdateCheck((status: string, details?: { version?: string }) => {
          if (status === "update_available") {
            console.log(
              `[WebRoom Auto-Update] Update found (${details?.version || "new"}). Applying immediately...`,
            );
            if (typeof runtime.reload === "function") {
              runtime.reload();
            }
          }
        });
      } catch {
        // Ignore errors in development / unsupported environments
      }
    }
  }

  // Check for updates on startup
  checkExtensionUpdates();

  // Check for updates periodically (every 4 hours)
  if (typeof setInterval !== "undefined") {
    setInterval(checkExtensionUpdates, 4 * 60 * 60 * 1000);
  }
}
