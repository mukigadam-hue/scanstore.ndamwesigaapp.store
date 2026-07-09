import { watermarkBlob } from "./watermark";

type DownloadResult = "native" | "browser" | "file-picker" | "share";

const safeFileName = (name: string) =>
  (name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";

const triggerBrowserDownload = (url: string, fileName: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = "noopener";
  a.target = "_blank";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const downloadFileFromUrl = async (url: string, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const raw = await resp.blob();
      const stamped = await watermarkBlob(raw, safeName);
      return await downloadBlob(stamped, safeName);
    }
  } catch { /* fall through */ }

  const nativeDownloader = (window as any).DocLocker?.downloadFile || (window as any).Android?.downloadFile;
  if (typeof nativeDownloader === "function") {
    nativeDownloader(url, safeName);
    return "native";
  }
  triggerBrowserDownload(url, safeName);
  return "browser";
};

export const downloadBlob = async (blob: Blob, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);
  // Watermarking can hang on huge blobs or old WebViews — race it against a
  // short timeout so the button always resolves quickly.
  const stamped: Blob = await Promise.race([
    watermarkBlob(blob, safeName).catch(() => blob),
    new Promise<Blob>((resolve) => setTimeout(() => resolve(blob), 2500)),
  ]);
  const mime = stamped.type || "application/octet-stream";
  const ua = navigator.userAgent || "";
  const isWebView = /\bwv\b|; wv\)|Version\/[\d.]+ Chrome\/[\d.]+ Mobile/i.test(ua);

  // 1. Native Android bridge (WebViewGold / custom shell) — best UX.
  const nativeDownloader =
    (window as any).DocLocker?.downloadFile ||
    (window as any).Android?.downloadFile ||
    (window as any).AndroidBridge?.downloadFile;
  if (typeof nativeDownloader === "function") {
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(stamped);
      });
      nativeDownloader(dataUrl, safeName);
      return "native";
    } catch { /* fall through */ }
  }

  // 2. Desktop / capable browser: showSaveFilePicker.
  const picker = (window as any).showSaveFilePicker;
  if (typeof picker === "function" && !isWebView) {
    try {
      const handle = await picker({
        suggestedName: safeName,
        types: mime
          ? [{ description: "File", accept: { [mime]: [`.${safeName.split(".").pop() || "bin"}`] } }]
          : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(stamped);
      await writable.close();
      return "file-picker";
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
    }
  }

  // 3. Web Share API with files — most reliable path on Android Chrome
  //    and most in-app WebViews. Surfaces the system "Save to files /
  //    Downloads" action so the user can store the file locally.
  const file = new File([stamped], safeName, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: safeName });
      return "share";
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
    }
  }

  // 4. Anchor download + blob URL navigation fallback. Android WebViews
  //    often swallow anchor downloads, so also open the blob URL so the
  //    shell's DownloadListener picks it up and shows the save prompt.
  const objectUrl = URL.createObjectURL(stamped);
  try { triggerBrowserDownload(objectUrl, safeName); } catch { /* ignore */ }
  setTimeout(() => {
    try { window.open(objectUrl, "_blank"); } catch { /* ignore */ }
  }, 200);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName);
};
