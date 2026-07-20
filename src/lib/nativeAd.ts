// Native interstitial trigger.
//
// Ads are only emitted from explicit post-action checkpoints controlled by
// src/lib/ads.ts. Preloading is deliberately restricted to safe preload-style
// bridge names so app startup/sign-out/back navigation can never display ads.

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

function callFirst(methods: string[], args: unknown[] = []): boolean {
  for (const b of bridges()) {
    for (const m of methods) {
      try {
        if (typeof b[m] === "function") {
          try {
            b[m](...args);
          } catch {
            b[m]();
          }
          return true;
        }
      } catch {
        /* ignore, try next */
      }
    }
  }
  return false;
}

const safeTrigger = (trigger: string) => trigger.replace(/[^a-z0-9_-]/gi, "").slice(0, 48) || "ad";

function emitTriggerUrl(trigger: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const frame = document.createElement("iframe");
    frame.title = "ad-trigger";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;bottom:-9999px;border:0;opacity:0;pointer-events:none;";
    frame.src = `/ad-trigger.html?doclocker-interstitial=${encodeURIComponent(safeTrigger(trigger))}`;
    document.body.appendChild(frame);
    setTimeout(() => {
      try { frame.remove(); } catch { /* ignore */ }
    }, 2500);
    return true;
  } catch {
    return false;
  }
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
      for (const m of [
        "preloadInterstitial",
        "prepareInterstitial",
        "cacheInterstitial",
        "preloadInterstitialAd",
        "prepareInterstitialAd",
        "cacheInterstitialAd",
      ]) {
        try {
          if (typeof b[m] === "function") {
            try { b[m]("doclocker"); } catch { b[m](); }
            return;
          }
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
export function triggerNativeAd(trigger: string = "generic"): boolean {
  try {
    const id = safeTrigger(trigger);
    const bridgeShown = callFirst([
      "showInterstitial",
      "showInterstitialAd",
      "displayInterstitial",
      "displayInterstitialAd",
      "showFullScreenAd",
      "showFullscreenAd",
      "showAd",
      "startInterstitial",
    ], [id]);
    // NOTE: we intentionally do NOT bump window.history / hashchange here.
    // The WebViewGold shell counts navigations toward its own built-in
    // interstitial threshold — bumping history on every trigger caused
    // ads to fire on random screens and on the phone back button. Ads
    // now only show when we explicitly call the JS bridge from the
    // designated inner moments (last-verify, public save-to-phone,
    // etc.), which keeps ad placement predictable.
    return bridgeShown || emitTriggerUrl(id);
  } catch (e) {
    console.log("Native ad bridge unavailable:", e);
    return false;
  }
}
