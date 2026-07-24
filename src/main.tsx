import "./lib/polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { registerPwa } from "./lib/pwaRegister";
import { initOfflineSync } from "./lib/offlineQueue";

const rootEl = document.getElementById("root")!;

try {
  createRoot(rootEl).render(<App />);
} catch (err) {
  // Last-resort fallback so old WebViews never show a blank white screen.
  try { console.error("Fatal mount error:", err); } catch { /* ignore */ }
  rootEl.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#1a1207;color:#f5e6c4;font-family:system-ui,-apple-system,sans-serif;text-align:center;">
      <div style="max-width:360px;">
        <div style="font-size:42px;margin-bottom:12px;">🔑</div>
        <h1 style="font-size:20px;font-weight:700;margin-bottom:8px;">DocLocker couldn't start</h1>
        <p style="font-size:14px;opacity:0.85;margin-bottom:20px;">Your device may need an update. Please reload to try again.</p>
        <button onclick="location.reload()" style="background:#b8860b;color:#1a1207;border:0;padding:10px 22px;border-radius:8px;font-weight:700;font-size:15px;">Reload app</button>
      </div>
    </div>`;
}

// Defer non-critical startup work so old/slow phones reach first paint faster.
const idle = (cb: () => void) => {
  const w: any = window;
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb, { timeout: 3000 });
  else setTimeout(cb, 1500);
};

idle(() => { try { registerPwa(); } catch { /* ignore */ } });
idle(() => { try { initOfflineSync(); } catch { /* ignore */ } });
