// Native interstitial trigger.
//
// We NEVER navigate to any external URL (no window.location changes).
// Instead we call the WebViewGold-style Android JavaScript bridge when
// available. Outside the native shell (mobile browsers, iOS, desktop),
// this is a silent no-op so app flow continues uninterrupted.
//
// Bridge contract (WebViewGold Android):
//   Android.showInterstitial()  -> void
//
// This function ALWAYS returns immediately and NEVER throws. Ad clicks
// or ad-load failures never block the caller.

export function triggerNativeAd(_trigger: string = "generic"): void {
  try {
    const A: any = (window as any).Android;
    if (A && typeof A.showInterstitial === "function") {
      A.showInterstitial();
      return;
    }
    // Alternative bridge names some wrappers use.
    const W: any = (window as any).WebViewGold;
    if (W && typeof W.showInterstitial === "function") {
      W.showInterstitial();
      return;
    }
    console.log("Not running inside the WebViewGold native Android wrapper.");
  } catch (e) {
    // Swallow — ads must never break app flow.
    console.log("Native ad bridge unavailable:", e);
  }
}
