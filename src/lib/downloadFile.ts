import { supabase } from "@/integrations/supabase/client";
import { watermarkBlob } from "./watermark";

type DownloadResult = "direct" | "browser" | "file-picker" | "prepared" | "native" | "shared";

const safeFileName = (name: string) =>
  (name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";

const isAndroid = () => /Android/i.test(navigator.userAgent || "");
const isAndroidWebView = () => /WebViewGold|\bwv\b|; wv\)/i.test(navigator.userAgent || "");

const getMimeType = (fileName: string, fallback = "application/octet-stream") => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt")) return "text/plain";
  return fallback;
};

const nativeDownloadBridge = (url: string, fileName: string, mimeType?: string): boolean => {
  const safeName = safeFileName(fileName);
  const mime = mimeType || getMimeType(safeName);
  const bridges = [
    (window as any).DocLocker,
    (window as any).Android,
    (window as any).WebViewGold,
    (window as any).NativeBridge,
    (window as any).webkit?.messageHandlers?.downloadFile,
    (window as any).webkit?.messageHandlers?.download,
  ].filter(Boolean);

  for (const bridge of bridges) {
    try {
      if (typeof bridge?.downloadFile === "function") {
        bridge.downloadFile(url, safeName, mime);
        return true;
      }
      if (typeof bridge?.download === "function") {
        bridge.download(url, safeName, mime);
        return true;
      }
      if (typeof bridge?.saveFile === "function") {
        bridge.saveFile(url, safeName, mime);
        return true;
      }
      if (typeof bridge?.postMessage === "function") {
        bridge.postMessage({ url, fileName: safeName, mimeType: mime });
        return true;
      }
    } catch {
      // Try the next bridge/method.
    }
  }
  return false;
};

const triggerAnchorDownload = (url: string, fileName: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = "noopener";
  a.target = (isAndroid() || isAndroidWebView()) ? "_blank" : "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
};

const openDownloadUrl = (url: string, fileName: string, mimeType?: string): DownloadResult => {
  const safeName = safeFileName(fileName);
  if (nativeDownloadBridge(url, safeName, mimeType)) return "native";
  triggerAnchorDownload(url, safeName);
  return "direct";
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

const blobToFile = (blob: Blob, fileName: string) =>
  new File([blob], safeFileName(fileName), { type: blob.type || "application/octet-stream" });

const shareFileFallback = async (blob: Blob, fileName: string): Promise<boolean> => {
  const file = blobToFile(blob, fileName);
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  await nav.share({ files: [file], title: safeFileName(fileName) });
  return true;
};

const preparePhoneDownloadUrl = async (blob: Blob, fileName: string): Promise<string | null> => {
  try {
    const form = new FormData();
    form.append("file", blobToFile(blob, fileName));
    form.append("fileName", safeFileName(fileName));

    const { data, error } = await supabase.functions.invoke("phone-download", {
      body: form,
    });

    if (error) throw error;
    return typeof data?.signedUrl === "string" ? data.signedUrl : null;
  } catch (e) {
    console.warn("Phone download preparation failed", e);
    return null;
  }
};

/**
 * Download an already stored vault file. Keep this as a direct HTTPS file URL:
 * Android/WebViewGold download managers save real file links, while blob: URLs
 * often crash or report success without writing anything to phone storage.
 */
export const downloadFileFromUrl = async (url: string, fileName: string): Promise<DownloadResult> => {
  return openDownloadUrl(url, fileName, getMimeType(fileName));
};

/**
 * Download a generated public scan/photo. Phone app shells cannot reliably save
 * blob: or data: URLs, so on Android we first place the file behind a temporary
 * HTTPS URL from backend storage, then trigger the native downloader with that.
 */
export const downloadBlob = async (blob: Blob, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);
  const phoneShell = isAndroid() || isAndroidWebView();

  const stamped: Blob = await Promise.race([
    watermarkBlob(blob, safeName).catch(() => blob),
    new Promise<Blob>((resolve) => setTimeout(() => resolve(blob), 1200)),
  ]);

  if (!phoneShell && await writeWithFilePicker(stamped, safeName)) {
    return "file-picker";
  }

  if (phoneShell) {
    const preparedUrl = await preparePhoneDownloadUrl(stamped, safeName);
    if (preparedUrl) {
      const result = openDownloadUrl(preparedUrl, safeName, stamped.type || getMimeType(safeName));
      return result === "native" ? "native" : "prepared";
    }

    // Avoid Android DownloadManager crashes from blob:/data: URLs.
    if (await shareFileFallback(stamped, safeName)) return "shared";
    throw new Error("Phone storage link could not be prepared");
  }

  const objectUrl = URL.createObjectURL(stamped);
  try {
    triggerAnchorDownload(objectUrl, safeName);
  } finally {
    setTimeout(() => {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
    }, 60000);
  }

  return "browser";
};

export const watermarkedShare = async (blob: Blob, fileName: string): Promise<Blob> => {
  return watermarkBlob(blob, fileName).catch(() => blob);
};