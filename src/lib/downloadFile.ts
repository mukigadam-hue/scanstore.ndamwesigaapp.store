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
  a.remove();
};

export const downloadFileFromUrl = async (url: string, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);

  // Try to fetch + watermark image/PDF URLs; fall back to raw pipeline on failure.
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
  // Watermarking can hang on very large blobs / old WebViews. Race it
  // against a hard timeout so the save button always resolves quickly.
  const stamped: Blob = await Promise.race([
    watermarkBlob(blob, safeName).catch(() => blob),
    new Promise<Blob>((resolve) => setTimeout(() => resolve(blob), 2500)),
  ]);
  const picker = (window as any).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: safeName,
        types: stamped.type
          ? [{ description: "File", accept: { [stamped.type]: [`.${safeName.split(".").pop() || "bin"}`] } }]
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

  // Native Android bridge (WebViewGold / custom shell). Pass a data URL
  // so the shell can hand it to the platform DownloadManager.
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

  const file = new File([stamped], safeName, { type: stamped.type || "application/octet-stream" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: safeName });
      return "share";
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
    }
  }

  const objectUrl = URL.createObjectURL(stamped);
  try {
    triggerBrowserDownload(objectUrl, safeName);
  } catch { /* ignore */ }
  // Last-resort fallback for Android WebViews that swallow anchor
  // downloads — navigate to the blob URL so the shell shows the file.
  const ua = navigator.userAgent || "";
  if (/wv|Version\/.+Chrome/i.test(ua) && !/showSaveFilePicker/.test(String(picker))) {
    setTimeout(() => {
      try { window.open(objectUrl, "_blank"); } catch { /* ignore */ }
    }, 300);
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName);
};
