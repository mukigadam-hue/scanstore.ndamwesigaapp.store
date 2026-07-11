import { watermarkBlob } from "./watermark";

type DownloadResult = "native" | "direct" | "browser" | "file-picker" | "share" | "data-url";

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

const isAndroidWebView = () => {
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua) && (/\bwv\b|; wv\)|WebView|WebViewGold/i.test(ua));
};

const looksLikeImage = (fileName: string) => /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(fileName);

const triggerDirectUrlDownload = (url: string, fileName: string) => {
  const safeName = safeFileName(fileName);

  // WebViewGold's downloader works with real HTTP(S) links that end in a
  // downloadable file type / Content-Disposition. Do not convert those links
  // to blob: URLs inside the WebView — blob: URLs are not saved by its native
  // download manager.
  if (isAndroidWebView() && looksLikeImage(safeName)) {
    try {
      window.location.href = `savethisimage://?url=${encodeURIComponent(url)}`;
      return;
    } catch { /* fall through to normal link */ }
  }

  triggerAnchorDownload(url, safeName);
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const tryCachedDownloadUrl = async (blob: Blob, fileName: string): Promise<boolean> => {
  if (!("caches" in window) || !navigator.serviceWorker?.controller) return false;
  try {
    const safeName = safeFileName(fileName);
    const cache = await caches.open("local-downloads");
    const url = `${window.location.origin}/local-downloads/${Date.now()}-${encodeURIComponent(safeName)}`;
    await cache.put(
      url,
      new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeName.replace(/"/g, "'")}"`,
          "Cache-Control": "no-store",
        },
      })
    );
    triggerAnchorDownload(url, safeName);
    return true;
  } catch {
    return false;
  }
};

const writeWithFilePicker = async (blob: Blob, fileName: string): Promise<boolean> => {
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker !== "function") return false;
  try {
    const handle = await picker({ suggestedName: safeFileName(fileName) });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    return false;
  }
};

const shareFile = async (blob: Blob, fileName: string): Promise<boolean> => {
  try {
    const file = new File([blob], safeFileName(fileName), { type: blob.type || "application/octet-stream" });
    const nav: any = navigator;
    if (typeof nav.canShare === "function" && nav.canShare({ files: [file] }) && typeof nav.share === "function") {
      await nav.share({ files: [file], title: file.name });
      return true;
    }
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
  }
  return false;
};

/**
 * Try explicit native file bridges only. Generic Android.downloadFile methods
 * are used for real URLs below; passing them data: URLs often reports success
 * while nothing is written to Downloads.
 */
const tryNativeBase64Bridge = async (blob: Blob, fileName: string): Promise<boolean> => {
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
        if (typeof b.saveBase64 === "function") { b.saveBase64(dataUrl, fileName); return true; }
        if (typeof b.saveFileBase64 === "function") { b.saveFileBase64(dataUrl, fileName); return true; }
        if (typeof b.postMessage === "function") { b.postMessage({ action: "download", dataUrl, fileName }); return true; }
      } catch { /* try next */ }
    }
  } catch { /* fall through */ }
  return false;
};

export const downloadFileFromUrl = async (url: string, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);
  // Vault files already have a real HTTPS download URL with the backend's
  // download flag. Hand that URL directly to the phone/browser download
  // manager. Fetching it into a Blob first breaks Android WebView/WebViewGold
  // because blob: URLs are not persisted to local storage there.
  const nativeDownloader =
    (window as any).DocLocker?.downloadUrl ||
    (window as any).DocLocker?.downloadFile ||
    (window as any).Android?.downloadUrl ||
    (window as any).Android?.downloadFile ||
    (window as any).WebViewGold?.downloadUrl ||
    (window as any).WebViewGold?.downloadFile;
  if (typeof nativeDownloader === "function") {
    try {
      nativeDownloader(url, safeName);
      // Also fire the real link in case the generic bridge is present for a
      // different feature but does not actually save files.
      setTimeout(() => triggerDirectUrlDownload(url, safeName), 150);
      return "native";
    } catch { /* fall through */ }
  }

  triggerDirectUrlDownload(url, safeName);
  return "direct";
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
  const isWebView = isAndroidWebView();

  // 1. Desktop / capable Chromium: write the file, not just open a link.
  if (!isAndroid && !isWebView && await writeWithFilePicker(stamped, safeName)) return "file-picker";

  // 2. Explicit native base64 bridge, when the shell provides one.
  if (await tryNativeBase64Bridge(stamped, safeName)) return "native";

  // 3. Published PWA/native WebView path for generated scans: put the file
  // behind a same-origin URL that ends with the actual extension, then let the
  // service worker serve it with Content-Disposition. This avoids blob: URLs.
  if ((isAndroid || isWebView) && await tryCachedDownloadUrl(stamped, safeName)) return "direct";

  // 4. Android browsers/WebViews cannot reliably save generated blob: URLs.
  // The system share sheet is the only standards-based way to hand a generated
  // in-memory file to local Files/Downloads without a native downloader bridge.
  if ((isAndroid || isWebView) && await shareFile(stamped, safeName)) return "share";

  // 5. Anchor blob URL — standard browser fallback.
  const objectUrl = URL.createObjectURL(stamped);
  try {
    triggerAnchorDownload(objectUrl, safeName);
  } finally {
    setTimeout(() => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } }, 60000);
  }

  // 6. Last backup for small files only. Keep the size low because data: URLs
  // duplicate the file in memory and can crash older Android WebViews.
  if (!isWebView && stamped.size < 4 * 1024 * 1024) {
    try {
      const dataUrl = await blobToDataUrl(stamped);
      setTimeout(() => triggerAnchorDownload(dataUrl, safeName), 250);
      return "data-url";
    } catch { /* ignore */ }
  }

  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName).catch(() => blob);
};
