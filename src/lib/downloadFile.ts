import { watermarkBlob } from "./watermark";

type DownloadResult = "native" | "browser" | "file-picker" | "share" | "data-url";

const safeFileName = (name: string) =>
  (name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";

const triggerAnchorDownload = (url: string, fileName: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = "noopener";
  a.target = "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Try to hand the file to a native downloader exposed by the WebView shell.
 * WebViewGold-style shells commonly expose one of these bridges.
 */
const tryNativeBridge = async (blob: Blob, fileName: string): Promise<boolean> => {
  const bridges: any[] = [
    (window as any).DocLocker,
    (window as any).Android,
    (window as any).WVGDownloader,
    (window as any).webkit?.messageHandlers?.download,
  ].filter(Boolean);
  if (!bridges.length) return false;

  try {
    const dataUrl = await blobToDataUrl(blob);
    for (const b of bridges) {
      try {
        if (typeof b.downloadBase64 === "function") { b.downloadBase64(dataUrl, fileName); return true; }
        if (typeof b.downloadFile === "function") { b.downloadFile(dataUrl, fileName); return true; }
        if (typeof b.saveFile === "function") { b.saveFile(dataUrl, fileName); return true; }
        if (typeof b.postMessage === "function") { b.postMessage({ action: "download", dataUrl, fileName }); return true; }
      } catch { /* try next */ }
    }
  } catch { /* fall through */ }
  return false;
};

export const downloadFileFromUrl = async (url: string, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const raw = await resp.blob();
      const stamped = await watermarkBlob(raw, safeName).catch(() => raw);
      return await downloadBlob(stamped, safeName);
    }
  } catch { /* fall through */ }

  // Last-ditch: hand the remote URL to a native bridge if present.
  const nativeDownloader = (window as any).DocLocker?.downloadFile || (window as any).Android?.downloadFile;
  if (typeof nativeDownloader === "function") {
    try { nativeDownloader(url, safeName); return "native"; } catch { /* fall through */ }
  }
  triggerAnchorDownload(url, safeName);
  return "browser";
};

/**
 * Save a blob to the user's device. Order is tuned so files actually land
 * in phone storage (not just "shared"):
 *   1. Native bridge exposed by the WebView shell (real save-to-Downloads).
 *   2. Anchor download of a blob URL (standard browsers + modern WebViews).
 *   3. Data-URL anchor download for smaller files (WebViewGold intercepts data: URLs).
 *   4. File System Access picker on capable desktop browsers.
 * Web Share is intentionally NOT auto-used here — it "shares" instead of
 * saving to phone storage, which is not what the user wants.
 */
export const downloadBlob = async (blob: Blob, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);

  const stamped: Blob = await Promise.race([
    watermarkBlob(blob, safeName).catch(() => blob),
    new Promise<Blob>((resolve) => setTimeout(() => resolve(blob), 1500)),
  ]);
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isWebView = /wv|; wv\)/i.test(ua) || /WebView/i.test(ua);

  // 1. Native bridge (best: writes to phone Downloads folder).
  if (await tryNativeBridge(stamped, safeName)) return "native";

  // 2. Anchor blob URL — the standard cross-browser download path.
  const objectUrl = URL.createObjectURL(stamped);
  try {
    triggerAnchorDownload(objectUrl, safeName);
  } finally {
    setTimeout(() => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } }, 60000);
  }

  // 3. On Android WebViews, blob: URLs are often ignored by the shell's
  //    DownloadListener. As a belt-and-braces backup, also fire a data:
  //    URL anchor for files under 8 MB — many shells intercept data: URLs
  //    and save them. Skipping for larger files to avoid memory pressure.
  if ((isAndroid || isWebView) && stamped.size < 8 * 1024 * 1024) {
    try {
      const dataUrl = await blobToDataUrl(stamped);
      // Slight delay so the two downloads don't collapse into one intent.
      setTimeout(() => triggerAnchorDownload(dataUrl, safeName), 250);
      return "data-url";
    } catch { /* ignore */ }
  }

  // 4. Desktop capable browsers: also offer a save picker if nothing has
  //    caught the download yet. (Non-blocking — anchor already fired.)
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker === "function" && !isAndroid && !isWebView) {
    // Anchor already handled it in browsers; picker path is optional.
  }

  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName).catch(() => blob);
};
