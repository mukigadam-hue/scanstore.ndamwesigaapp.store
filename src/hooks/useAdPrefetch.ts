// Module-level store for pre-fetched ad keys.
// Persists across navigations without causing re-renders.

import { prefetchInterstitial } from "@/lib/ads";

const prefetchedAds: Record<string, number> = {};

let nativeWarmed = 0;

/**
 * Call this hook inside ad-free pages (viewer, scanner, editor)
 * to silently prepare ad data so ads render instantly on return.
 */
export function useAdPrefetch(slotIds: string[]) {
  // Silently warm the native interstitial cache (preload-only, never shows an
  // ad) so the approved checkpoints display instantly. Throttled to 2 min.
  if (Date.now() - nativeWarmed > 2 * 60 * 1000) {
    nativeWarmed = Date.now();
    try { prefetchInterstitial(); } catch { /* ignore */ }
  }

  // Pre-generate fresh keys for each slot
  for (const id of slotIds) {
    if (!prefetchedAds[id]) {
      prefetchedAds[id] = Date.now();
    }
  }
}

export function getPrefetchedAd(slotId: string): number | null {
  return prefetchedAds[slotId] ?? null;
}

export function clearPrefetchedAd(slotId: string) {
  delete prefetchedAds[slotId];
}
