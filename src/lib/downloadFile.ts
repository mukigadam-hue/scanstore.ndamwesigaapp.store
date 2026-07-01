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
  const stamped = await watermarkBlob(blob, safeName);
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
  triggerBrowserDownload(objectUrl, safeName);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName);
};
