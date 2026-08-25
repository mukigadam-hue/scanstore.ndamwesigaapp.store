// Native interstitial bridge for the WebViewGold Android/iOS shell.
//
// WebViewGold exposes interstitials in three different ways depending on the
// shell version / platform:
//   1. A JS bridge object  -> window.Android.showInterstitial()
//   2. URL scheme commands -> location.href = "showinterstitial://"
//   3. A global function   -> window.showInterstitial()
//
// We try all of them (bridge first, then URL schemes) so the ad fires no
// matter which shell build wraps the app. Ads are ONLY emitted from the
// approved checkpoints in src/lib/ads.ts — never on navigation/back/sign-out.

type Bridge = any;

function bridges(): Bridge[] {
  if (typeof window === "undefined") return [];
  const w = window as any;
  return [w.Android, w.WebViewGold, w.webviewgold, w.NativeBridge, w.DocLocker].filter(Boolean);
}

const safeTrigger = (trigger: string) =>
  trigger.replace(/[^a-z0-9_-]/gi, "").slice(0, 48) || "ad";

function callBridge(methods: string[], arg: string): boolean {
  for (const b of bridges()) {
    for (const m of methods) {
      try {
        if (typeof b[m] === "function") {
          try {
            b[m](arg);
          } catch {
            b[m]();
          }
          return true;
        }
      } catch {
        /* try next */
      }
    }
  }
  // Some shells inject plain globals instead of a bridge object.
  const w = window as any;
  for (const m of methods) {
    try {
      if (typeof w[m] === "function") {
        try {
          w[m](arg);
        } catch {
          w[m]();
        }
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * Fire a WebViewGold URL-scheme command through a throwaway iframe.
 * Using an iframe (instead of location.href) keeps the SPA route intact,
 * so no back-button/navigation side effects.
 */
function emitScheme(scheme: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  try {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "ad-bridge";
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;width:1px;height:1px;left:-9999px;bottom:-9999px;border:0;opacity:0;pointer-events:none;";
    frame.src = scheme;
    document.body.appendChild(frame);
    setTimeout(() => {
      try {
        frame.remove();
      } catch {
        /* ignore */
      }
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

/** True when the app is running inside an Android WebView shell (WebViewGold). */
export function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bwv\b|WebViewGold|; wv\)/i.test(navigator.userAgent);
}

/** True when any native ad surface is reachable. */
export function hasNativeAdBridge(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  if (typeof w.showInterstitial === "function") return true;
  for (const b of bridges()) {
    for (const m of ["showInterstitial", "showInterstitialAd", "showAd"]) {
      try {
        if (typeof b[m] === "function") return true;
      } catch {
        /* ignore */
      }
    }
  }
  return isAndroidWebView();
}

/**
 * Silently cache an interstitial in the background so the next approved
 * checkpoint can display it instantly. Only preload-style calls are used —
 * this can never display an ad by itself.
 */
export function preloadNativeAds(): void {
  try {
    const preloaded = callBridge(
      [
        "preloadInterstitial",
        "prepareInterstitial",
        "cacheInterstitial",
        "preloadInterstitialAd",
        "prepareInterstitialAd",
        "cacheInterstitialAd",
        "loadInterstitial",
      ],
      "doclocker",
    );
    if (preloaded) return;
    if (isAndroidWebView()) {
      emitScheme("preloadinterstitial://");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Show a WebViewGold interstitial. Returns true when a trigger was emitted.
 */
export function triggerNativeAd(trigger: string = "generic"): boolean {
  try {
    const id = safeTrigger(trigger);

    const viaBridge = callBridge(
      [
        "showInterstitial",
        "showInterstitialAd",
        "displayInterstitial",
        "displayInterstitialAd",
        "showFullScreenAd",
        "showFullscreenAd",
        "startInterstitial",
        "showAd",
      ],
      id,
    );
    if (viaBridge) return true;

    // URL-scheme fallback — this is the documented WebViewGold command set.
    if (isAndroidWebView() || typeof (window as any).Android !== "undefined") {
      const schemes = [
        "showinterstitial://",
        "admobinterstitial://",
        "interstitial://show",
      ];
      let emitted = false;
      for (const s of schemes) {
        emitted = emitScheme(s) || emitted;
      }
      if (emitted) return true;
    }

    return false;
  } catch (e) {
    console.log("Native ad bridge unavailable:", e);
    return false;
  }
}
