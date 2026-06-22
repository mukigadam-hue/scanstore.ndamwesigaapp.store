// Lightweight interstitial ad controller.
// Always resolves so the calling workflow never freezes.
// Offline = instant skip. Online = full-screen overlay with skip timer.

type Listener = (trigger: string, resolve: () => void) => void;

let listener: Listener | null = null;
let prefetched = false;

export function registerInterstitialHost(l: Listener | null) {
  listener = l;
}

export function prefetchInterstitial() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  prefetched = true;
}

export function showInterstitial(trigger: string): Promise<void> {
  return new Promise((resolve) => {
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
