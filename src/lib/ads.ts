// Interstitial ad controller. Only call showInterstitial() at approved
// post-action checkpoints: final verification and successful public save.

import { triggerNativeAd, preloadNativeAds } from "./nativeAd";

// Kept for backwards compatibility with BannerAd. Banner ads are
// disabled everywhere until a real SDK is wired.
export const AD_NETWORK_READY = false;

type Listener = (trigger: string, resolve: () => void) => void;

let listener: Listener | null = null;
const inFlight = new Set<string>();
const ALLOWED_TRIGGERS = new Set(["last-verify", "save-to-phone"]);

export function registerInterstitialHost(l: Listener | null) {
  listener = l;
}

export function prefetchInterstitial() {
  // Warm the native ad cache so the next trigger renders instantly.
  preloadNativeAds();
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
    if (!ALLOWED_TRIGGERS.has(trigger)) { resolve(); return; }
    if (inFlight.has(trigger)) { resolve(); return; }
    if (withinCooldown(trigger, cooldownMs)) { resolve(); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { resolve(); return; }
    inFlight.add(trigger);
    const emitted = triggerNativeAd(trigger);
    if (emitted) {
      markShown(trigger);
      // Warm the cache again for the next trigger point.
      setTimeout(() => { try { preloadNativeAds(); } catch { /* ignore */ } }, 1500);
    }
    setTimeout(() => inFlight.delete(trigger), 1200);
    resolve();
  });
}


export function hasPrefetched() {
  return false;
}
