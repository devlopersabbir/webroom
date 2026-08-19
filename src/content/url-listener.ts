/**
 * Listens for both standard browser navigation and SPA (Single Page Application)
 * URL state changes (pushState, replaceState, popstate, hashchange).
 */

export type UrlChangeHandler = (newUrl: string, oldUrl: string) => void;

export class UrlListener {
  private lastUrl: string;
  private handlers = new Set<UrlChangeHandler>();
  private originalPushState: typeof window.history.pushState | null = null;
  private originalReplaceState: typeof window.history.replaceState | null = null;
  private popstateListener: (() => void) | null = null;
  private hashchangeListener: (() => void) | null = null;
  private isListening = false;

  constructor() {
    this.lastUrl = window.location.href;
  }

  public start(): void {
    if (this.isListening) {
      return;
    }
    this.isListening = true;

    // 1. Intercept pushState
    this.originalPushState = window.history.pushState;
    window.history.pushState = (...args: Parameters<typeof window.history.pushState>) => {
      if (this.originalPushState) {
        this.originalPushState.apply(window.history, args);
      }
      this.checkUrlChange();
    };

    // 2. Intercept replaceState
    this.originalReplaceState = window.history.replaceState;
    window.history.replaceState = (...args: Parameters<typeof window.history.replaceState>) => {
      if (this.originalReplaceState) {
        this.originalReplaceState.apply(window.history, args);
      }
      this.checkUrlChange();
    };

    // 3. Listen to popstate (back/forward navigation)
    this.popstateListener = () => {
      this.checkUrlChange();
    };
    window.addEventListener("popstate", this.popstateListener);

    // 4. Listen to hashchange
    this.hashchangeListener = () => {
      this.checkUrlChange();
    };
    window.addEventListener("hashchange", this.hashchangeListener);
  }

  public onChange(handler: UrlChangeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  public stop(): void {
    if (!this.isListening) {
      return;
    }
    this.isListening = false;

    if (this.originalPushState) {
      window.history.pushState = this.originalPushState;
      this.originalPushState = null;
    }

    if (this.originalReplaceState) {
      window.history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    if (this.popstateListener) {
      window.removeEventListener("popstate", this.popstateListener);
      this.popstateListener = null;
    }

    if (this.hashchangeListener) {
      window.removeEventListener("hashchange", this.hashchangeListener);
      this.hashchangeListener = null;
    }

    this.handlers.clear();
  }

  private checkUrlChange(): void {
    const currentUrl = window.location.href;
    if (currentUrl !== this.lastUrl) {
      const oldUrl = this.lastUrl;
      this.lastUrl = currentUrl;

      for (const handler of this.handlers) {
        try {
          handler(currentUrl, oldUrl);
        } catch (err) {
          console.error("[WebRoom UrlListener] Error in url change handler:", err);
        }
      }
    }
  }
}
