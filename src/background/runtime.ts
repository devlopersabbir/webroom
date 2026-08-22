declare const chrome: any;

export function getExtensionRuntime(): any {
  if (typeof (globalThis as any).browser !== "undefined" && (globalThis as any).browser?.runtime) {
    return (globalThis as any).browser.runtime;
  }
  if (typeof chrome !== "undefined" && chrome?.runtime) {
    return chrome.runtime;
  }
  return null;
}
