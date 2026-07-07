import "./lib/polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { registerPwa } from "./lib/pwaRegister";
import { initOfflineSync } from "./lib/offlineQueue";
import { preloadNativeAds } from "./lib/nativeAd";

// Warm the native ad cache as early as possible so the very first
// interstitial + banner render the instant their trigger fires.
preloadNativeAds();
// Re-warm shortly after so late-injected bridges (WebViewGold sometimes
// attaches Android.* after DOMContentLoaded) also get preloaded.
if (typeof window !== "undefined") {
  window.addEventListener("load", () => preloadNativeAds());
  setTimeout(preloadNativeAds, 500);
  setTimeout(preloadNativeAds, 2000);
}

createRoot(document.getElementById("root")!).render(<App />);

// Kick off PWA registration + offline queue sync after mount.
registerPwa();
initOfflineSync();
