// Interstitial ad controller.
//
// Priority order at every designated ad point:
//   1. If the WebViewGold native Android bridge is present, call
//      Android.showInterstitial() and resolve immediately. The native
//      shell displays the real preloaded AdMob interstitial on top of
//      the WebView; our JS flow continues without waiting.
//   2. Otherwise (mobile browser, iOS, desktop) resolve immediately —
//      we do NOT show an in-app placeholder overlay, and we NEVER
//      redirect to any external URL.
//
// This guarantees the app never freezes on an ad and never opens a
// WebViewGold landing page.

import { triggerNativeAd } from "./nativeAd";

// Kept for backwards compatibility with BannerAd. Banner ads are
// disabled everywhere until a real SDK is wired.
export const AD_NETWORK_READY = false;

type Listener = (trigger: string, resolve: () => void) => void;

let listener: Listener | null = null;

export function registerInterstitialHost(l: Listener | null) {
  listener = l;
}

export function prefetchInterstitial() {
  // Native shell handles prefetching. No-op on the web.
}

function hasNativeBridge(): boolean {
  const A: any = (typeof window !== "undefined" && (window as any).Android) || null;
  const W: any = (typeof window !== "undefined" && (window as any).WebViewGold) || null;
  return (
    (A && typeof A.showInterstitial === "function") ||
    (W && typeof W.showInterstitial === "function")
  );
}

export function showInterstitial(trigger: string): Promise<void> {
  return new Promise((resolve) => {
    // 1. Real native ad via WebViewGold bridge (fire-and-forget).
    if (hasNativeBridge()) {
      triggerNativeAd(trigger);
      resolve();
      return;
    }
    // 2. Offline or no listener → skip instantly.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      resolve();
      return;
    }
    // 3. No native shell and no real web SDK yet → skip silently.
    //    (We intentionally do NOT open the in-app overlay to avoid
    //    showing users an empty "Advertisement" placeholder.)
    resolve();
    return;
    // eslint-disable-next-line no-unreachable
    if (!listener) return;
    const safety = setTimeout(() => resolve(), 6000);
    listener(trigger, () => { clearTimeout(safety); resolve(); });
  });
}

export function hasPrefetched() {
  return false;
}
