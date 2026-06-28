// WebViewGold-compatible interstitial trigger.
// In WebViewGold, navigating to https://webviewgold.com is intercepted
// by the native shell to fire a native AdMob interstitial without
// actually leaving the app. In a normal browser this is a no-op so
// the user's flow is never interrupted.

const MIN_INTERVAL_MS = 60_000; // throttle so flows aren't spammed
let lastFired = 0;

function isWebViewGold(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /WebViewGold|wv\)/i.test(ua) || !!(window as any).WebViewGold;
}

/**
 * Trigger a native interstitial via WebViewGold's URL hook.
 * - Skipped when offline.
 * - Skipped outside WebViewGold (so dev/preview stays clean).
 * - Throttled to avoid rapid repeat triggers.
 */
export function triggerNativeAd(_trigger: string = "generic"): void {
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!isWebViewGold()) return;
    const now = Date.now();
    if (now - lastFired < MIN_INTERVAL_MS) return;
    lastFired = now;
    // The WebViewGold shell intercepts this URL — it never actually navigates.
    window.location.href = "https://webviewgold.com";
  } catch {
    /* never let an ad trigger break the workflow */
  }
}
