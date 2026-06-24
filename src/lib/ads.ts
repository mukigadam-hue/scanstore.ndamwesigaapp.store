// Lightweight interstitial ad controller.
// Always resolves so the calling workflow never freezes.
// Offline = instant skip. Online = full-screen overlay with skip timer.
//
// IMPORTANT: while AdMob (or any real ad network) is not yet wired up,
// we DO NOT show empty/placeholder ad surfaces to the user. Calls are
// resolved immediately so the workflow continues without interruption.
// Flip AD_NETWORK_READY to true once a real ad SDK is integrated.

export const AD_NETWORK_READY = false;

type Listener = (trigger: string, resolve: () => void) => void;

let listener: Listener | null = null;
let prefetched = false;

export function registerInterstitialHost(l: Listener | null) {
  listener = l;
}

export function prefetchInterstitial() {
  if (!AD_NETWORK_READY) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  prefetched = true;
}

export function showInterstitial(trigger: string): Promise<void> {
  return new Promise((resolve) => {
    // No real ad network yet → skip instantly, never show an empty ad surface.
    if (!AD_NETWORK_READY) {
      resolve();
      return;
    }
    // Offline: skip instantly so the user's workflow never freezes.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      resolve();
      return;
    }
    if (!listener) {
      resolve();
      return;
    }
    // 6s safety: if the overlay never fires the callback, still resolve.
    const safety = setTimeout(() => resolve(), 6000);
    listener(trigger, () => {
      clearTimeout(safety);
      prefetched = false;
      // Warm the next one for the following trigger.
      prefetchInterstitial();
      resolve();
    });
  });
}

export function hasPrefetched() {
  return prefetched;
}

