// Module-level store for pre-fetched ad keys.
// Persists across navigations without causing re-renders.

const prefetchedAds: Record<string, number> = {};

/**
 * Call this hook inside ad-free pages (viewer, scanner, editor)
 * to silently prepare ad data so ads render instantly on return.
 */
export function useAdPrefetch(slotIds: string[]) {
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
