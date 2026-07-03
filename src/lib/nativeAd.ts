// Native interstitial trigger (no-op).
//
// Previously this navigated to https://webviewgold.com to trigger the
// native shell's AdMob interstitial. That caused real redirects to
// webviewgold.com in browsers/WebViews that don't intercept the URL,
// breaking flows like the 2-Step Verification screen.
//
// We now NEVER redirect window.location. Interstitials are handled
// entirely by the in-app overlay via `showInterstitial` in src/lib/ads.ts.
// This function is kept as a safe no-op so existing call sites continue
// to work without changes.

export function triggerNativeAd(_trigger: string = "generic"): void {
  // Intentionally a no-op. Do NOT set window.location here.
  return;
}
