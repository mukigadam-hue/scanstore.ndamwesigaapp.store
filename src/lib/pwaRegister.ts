// Guarded service worker registration.
// Never registers in dev, Lovable preview, or inside an iframe.
// Supports ?sw=off kill switch to unregister.

const APP_SW_URL = "/sw.js";

function inIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

function isBlockedHost(): boolean {
  const h = location.hostname;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  return false;
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      if (url.endsWith(APP_SW_URL)) await r.unregister();
    }
  } catch { /* ignore */ }
}

export async function registerPwa() {
  if (!("serviceWorker" in navigator)) return;

  const killSwitch = new URLSearchParams(location.search).get("sw") === "off";
  const refuse =
    !import.meta.env.PROD ||
    inIframe() ||
    isBlockedHost() ||
    killSwitch;

  if (refuse) {
    await unregisterAppSw();
    return;
  }

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch (e) {
    console.warn("PWA register failed", e);
  }
}
