// Native interstitial trigger + silent preloader.
//
// We NEVER navigate to any external URL. Instead we call the
// WebViewGold-style Android JavaScript bridge when available.
// Outside the native shell this is a silent no-op.
//
// Bridge contract (best-effort; we probe multiple names so ads fire
// as fast as possible on whatever wrapper is present):
//   Android.showInterstitial() / preloadInterstitial() / loadInterstitial()
//   Android.showBanner()       / preloadBanner()       / loadBanner()
//   WebViewGold.*  (same method names)
//
// All calls ALWAYS return immediately and NEVER throw.

type Bridge = any;

function bridges(): Bridge[] {
  if (typeof window === "undefined") return [];
  const out: Bridge[] = [];
  const A = (window as any).Android;
  const W = (window as any).WebViewGold;
  if (A) out.push(A);
  if (W) out.push(W);
  return out;
}

function callFirst(methods: string[]): boolean {
  for (const b of bridges()) {
    for (const m of methods) {
      try {
        if (typeof b[m] === "function") {
          b[m]();
          return true;
        }
      } catch {
        /* ignore, try next */
      }
    }
  }
  return false;
}

/** Warm up the ad SDK as early as possible so triggers show instantly. */
export function preloadNativeAds(): void {
  try {
    callFirst([
      "preloadInterstitial",
      "loadInterstitial",
      "cacheInterstitial",
      "prepareInterstitial",
    ]);
    callFirst([
      "preloadBanner",
      "loadBanner",
      "showBanner", // some wrappers auto-cache on first show
    ]);
  } catch {
    /* never throw */
  }
}

export function triggerNativeAd(_trigger: string = "generic"): void {
  try {
    const shown = callFirst(["showInterstitial", "displayInterstitial"]);
    if (!shown) {
      // Not in native shell — kick a preload for next time anyway.
      preloadNativeAds();
    } else {
      // Immediately queue the next one so the following trigger is instant.
      setTimeout(preloadNativeAds, 0);
    }
  } catch (e) {
    console.log("Native ad bridge unavailable:", e);
  }
}
