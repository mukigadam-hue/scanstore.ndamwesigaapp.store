import "./lib/polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { registerPwa } from "./lib/pwaRegister";
import { initOfflineSync } from "./lib/offlineQueue";
import { preloadNativeAds } from "./lib/nativeAd";

createRoot(document.getElementById("root")!).render(<App />);

// Kick off PWA registration + offline queue sync after mount.
registerPwa();
initOfflineSync();
// Silently warm the native ad cache in the background so interstitials
// are ready to display instantly at their designated trigger points
// (last-verify, save-to-phone). This never displays an ad on its own.
setTimeout(() => { try { preloadNativeAds(); } catch { /* ignore */ } }, 2500);

