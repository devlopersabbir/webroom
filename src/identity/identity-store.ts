/**
 * WebRoom v3 - Identity Storage Layer
 * 
 * Provides an environment-resilient persistence mechanism for NodeIdentity key material.
 * Automatically delegates across:
 * 1. WebExtension Storage API (chrome.storage.local / browser.storage.local)
 * 2. DOM localStorage (fallback for standard web contexts / content scripts)
 * 3. Memory storage (fallback for headless test runners / memory compartments)
 */

declare const chrome: any;

export interface IdentityStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * In-memory fallback storage adapter primarily used for isolated tests and headless execution.
 */
export class MemoryIdentityStorage implements IdentityStorage {
  private readonly store = new Map<string, string>();

  public async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  public async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  public async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Universal browser extension storage adapter.
 * Tries chrome.storage.local / browser.storage.local, then window.localStorage, then in-memory fallback.
 */
export class UniversalIdentityStorage implements IdentityStorage {
  private fallbackMemory = new MemoryIdentityStorage();

  public async get(key: string): Promise<string | null> {
    // 1. Try Chrome/Firefox Extension Storage API
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.get === "function"
      ) {
        const result = await chrome.storage.local.get(key);
        if (result && typeof result[key] === "string") {
          console.log(`[WebRoom Identity Storage] 📦 Retrieved key '${key}' from chrome.storage.local`);
          return result[key];
        }
        return null;
      }
    } catch {
      // Fall through if extension storage API fails or is restricted in context
    }

    // 2. Try window.localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const item = window.localStorage.getItem(key);
        if (item) {
          console.log(`[WebRoom Identity Storage] 📦 Retrieved key '${key}' from localStorage`);
        }
        return item;
      }
    } catch {
      // Fall through if localStorage access is denied (e.g., restricted iframe)
    }

    // 3. Fall back to in-memory store
    const memItem = await this.fallbackMemory.get(key);
    if (memItem) {
      console.log(`[WebRoom Identity Storage] 📦 Retrieved key '${key}' from memory store`);
    }
    return memItem;
  }

  public async set(key: string, value: string): Promise<void> {
    // 1. Try Chrome/Firefox Extension Storage API
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.set === "function"
      ) {
        await chrome.storage.local.set({ [key]: value });
        console.log(`[WebRoom Identity Storage] 💾 Persisted key '${key}' into chrome.storage.local`);
        return;
      }
    } catch {
      // Fall through
    }

    // 2. Try window.localStorage
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
        console.log(`[WebRoom Identity Storage] 💾 Persisted key '${key}' into localStorage`);
        return;
      }
    } catch {
      // Fall through
    }

    // 3. Fall back to in-memory store
    await this.fallbackMemory.set(key, value);
    console.log(`[WebRoom Identity Storage] 💾 Persisted key '${key}' into memory store`);
  }

  public async remove(key: string): Promise<void> {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local &&
        typeof chrome.storage.local.remove === "function"
      ) {
        await chrome.storage.local.remove(key);
        console.log(`[WebRoom Identity Storage] 🗑️ Removed key '${key}' from chrome.storage.local`);
        return;
      }
    } catch {
      // Fall through
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        console.log(`[WebRoom Identity Storage] 🗑️ Removed key '${key}' from localStorage`);
        return;
      }
    } catch {
      // Fall through
    }

    await this.fallbackMemory.remove(key);
    console.log(`[WebRoom Identity Storage] 🗑️ Removed key '${key}' from memory store`);
  }
}
