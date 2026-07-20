// Native interstitial trigger.
//
// We NEVER navigate to any external URL. Instead we call the
// WebViewGold-style Android JavaScript bridge when available.
// Outside the native shell this is a silent no-op.
//
// Bridge contract (best-effort; we probe multiple names):
//   Android.showInterstitial() / WebViewGold.showInterstitial()
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

/**
 * Silently ask the native shell to preload/cache an interstitial in the
 * background so it renders instantly at the next trigger. This ONLY calls
 * preload-style methods (never showInterstitial), so it cannot accidentally
 * display an ad. Outside the native shell this is a no-op.
 */
export function preloadNativeAds(): void {
  try {
    for (const b of bridges()) {
      for (const m of ["preloadInterstitial", "loadInterstitial", "cacheInterstitial", "prepareInterstitial"]) {
        try {
          if (typeof b[m] === "function") { b[m](); return; }
        } catch { /* try next */ }
      }
    }
  } catch { /* ignore */ }
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
 */
export function triggerNativeAd(_trigger: string = "generic"): void {
  try {
    callFirst(["showInterstitial", "displayInterstitial"]);
    // NOTE: we intentionally do NOT bump window.history / hashchange here.
    // The WebViewGold shell counts navigations toward its own built-in
    // interstitial threshold — bumping history on every trigger caused
    // ads to fire on random screens and on the phone back button. Ads
    // now only show when we explicitly call the JS bridge from the
    // designated inner moments (identity verified, auto-lock re-verify,
    // etc.), which keeps ad placement predictable.
  } catch (e) {
    console.log("Native ad bridge unavailable:", e);
  }
}
