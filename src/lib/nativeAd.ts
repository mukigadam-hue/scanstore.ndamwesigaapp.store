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

/** True when the app is running inside an Android WebView shell (WebViewGold). */
export function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bwv\b|WebViewGold/i.test(navigator.userAgent);
}

/**
 * Fire a WebViewGold interstitial trigger.
 *
 * - Calls the WebViewGold / Android JS bridge (`Android.showInterstitial()`)
 *   when available — this is the real interstitial.
 * - Also bumps a same-page hash change, which WebViewGold counts as a
 *   navigation toward its built-in interstitial threshold. Using a hash
 *   (not a full URL) means the app never leaves our domain and users
 *   never see the WebViewGold landing page.
 */
export function triggerNativeAd(_trigger: string = "generic"): void {
  try {
    const shown = callFirst(["showInterstitial", "displayInterstitial"]);
    // NOTE: we intentionally do NOT bump window.history / hashchange here.
    // The WebViewGold shell counts navigations toward its own built-in
    // interstitial threshold — bumping history on every trigger caused
    // ads to fire on random screens and on the phone back button. Ads
    // now only show when we explicitly call the JS bridge from the
    // designated inner moments (identity verified, auto-lock re-verify,
    // etc.), which keeps ad placement predictable.
    if (!shown) {
      preloadNativeAds();
    } else {
      setTimeout(preloadNativeAds, 0);
    }
  } catch (e) {
    console.log("Native ad bridge unavailable:", e);
  }
}
