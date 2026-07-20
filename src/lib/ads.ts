// Interstitial ad controller.
//
// Priority order at every designated ad point:
//   1. If the WebViewGold native Android bridge is present, call
//      Android.showInterstitial() and resolve immediately. The native
//      shell displays the real preloaded AdMob interstitial on top of
//      the WebView; our JS flow continues without waiting.
//   2. Otherwise (mobile browser, iOS, desktop) resolve immediately —
//      we do NOT show an in-app placeholder overlay, and we NEVER
//      redirect to any external URL.
//
// This guarantees the app never freezes on an ad and never opens a
// WebViewGold landing page.

import { triggerNativeAd, preloadNativeAds } from "./nativeAd";

// Kept for backwards compatibility with BannerAd. Banner ads are
// disabled everywhere until a real SDK is wired.
export const AD_NETWORK_READY = false;

type Listener = (trigger: string, resolve: () => void) => void;

let listener: Listener | null = null;

export function registerInterstitialHost(l: Listener | null) {
  listener = l;
}

export function prefetchInterstitial() {
  // Warm the native ad cache so the next trigger renders instantly.
  preloadNativeAds();
}


function hasNativeBridge(): boolean {
  const A: any = (typeof window !== "undefined" && (window as any).Android) || null;
  const W: any = (typeof window !== "undefined" && (window as any).WebViewGold) || null;
  return (
    (A && typeof A.showInterstitial === "function") ||
    (W && typeof W.showInterstitial === "function")
  );
}

// Per-trigger cooldown map (in-memory + localStorage for cross-reload).
const COOLDOWN_KEY = "ad_cooldown_";
function withinCooldown(trigger: string, cooldownMs: number): boolean {
  if (!cooldownMs) return false;
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY + trigger);
    if (!raw) return false;
    const last = parseInt(raw, 10);
    if (Number.isNaN(last)) return false;
    return Date.now() - last < cooldownMs;
  } catch { return false; }
}
function markShown(trigger: string) {
  try { localStorage.setItem(COOLDOWN_KEY + trigger, String(Date.now())); } catch {}
}

export function showInterstitial(trigger: string, cooldownMs = 0): Promise<void> {
  return new Promise((resolve) => {
    if (withinCooldown(trigger, cooldownMs)) { resolve(); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { resolve(); return; }
    if (hasNativeBridge()) {
      triggerNativeAd(trigger);
      markShown(trigger);
      // Warm the cache again for the next trigger point.
      setTimeout(() => { try { preloadNativeAds(); } catch { /* ignore */ } }, 1500);
    }
    // No native shell → skip silently (no in-app placeholder overlay).
    resolve();
  });
}


export function hasPrefetched() {
  return false;
}
