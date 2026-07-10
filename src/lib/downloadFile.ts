import { watermarkBlob } from "./watermark";

type DownloadResult = "native" | "browser" | "file-picker" | "share";

const safeFileName = (name: string) =>
  (name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";

const triggerBrowserDownload = (url: string, fileName: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
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

  const nativeDownloader = (window as any).DocLocker?.downloadFile || (window as any).Android?.downloadFile;
  if (typeof nativeDownloader === "function") {
    try { nativeDownloader(url, safeName); return "native"; } catch { /* fall through */ }
  }
  triggerBrowserDownload(url, safeName);
  return "browser";
};

/**
 * Save a blob to the user's device. Uses the least-crash-prone path first:
 * Web Share (Android), then File System Access (desktop), then anchor
 * download of an object URL (universal fallback). We intentionally avoid
 * converting large blobs to base64 data URLs — that reliably crashes
 * Android WebViews on multi-MB PDFs.
 */
export const downloadBlob = async (blob: Blob, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);

  // Watermark with a hard timeout so the button never hangs.
  const stamped: Blob = await Promise.race([
    watermarkBlob(blob, safeName).catch(() => blob),
    new Promise<Blob>((resolve) => setTimeout(() => resolve(blob), 1500)),
  ]);
  const mime = stamped.type || "application/octet-stream";
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);

  // 1. Web Share API with files — most reliable path on Android (including
  //    in-app WebViews). Surfaces the system "Save to files / Downloads"
  //    action. Try this first on Android before any anchor tricks.
  try {
    const file = new File([stamped], safeName, { type: mime });
    if (isAndroid && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: safeName });
      return "share";
    }
  } catch (error: any) {
    if (error?.name === "AbortError") throw error;
    /* fall through */
  }

  // 2. Desktop / capable browser: showSaveFilePicker.
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker === "function" && !isAndroid) {
    try {
      const handle = await picker({ suggestedName: safeName });
      const writable = await handle.createWritable();
      await writable.write(stamped);
      await writable.close();
      return "file-picker";
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
    }
  }

  // 3. Anchor download of a blob URL. Works in Chrome, Safari, and most
  //    modern Android WebViews via the shell's DownloadListener.
  const objectUrl = URL.createObjectURL(stamped);
  try {
    triggerBrowserDownload(objectUrl, safeName);
  } finally {
    // Give the browser time to start the download before revoking.
    setTimeout(() => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } }, 60000);
  }
  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName).catch(() => blob);
};
