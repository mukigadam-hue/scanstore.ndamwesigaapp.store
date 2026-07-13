import { supabase } from "@/integrations/supabase/client";
import { watermarkBlob } from "./watermark";

type DownloadResult = "direct" | "browser" | "file-picker" | "prepared";

const safeFileName = (name: string) =>
  (name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";

const isAndroid = () => /Android/i.test(navigator.userAgent || "");
const isWebViewGold = () => /WebViewGold|\bwv\b|; wv\)/i.test(navigator.userAgent || "");

const looksLikeImage = (fileName: string) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName);

const triggerAnchorDownload = (url: string, fileName: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(fileName);
  a.rel = "noopener";
  a.target = (isAndroid() || isWebViewGold()) ? "_blank" : "_self";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
};

const openDownloadUrl = (url: string, fileName: string) => {
  const safeName = safeFileName(fileName);

  // WebViewGold documents say images should be saved through this native URL
  // scheme. PDFs and other files must be normal HTTPS links with file suffixes.
  if ((isAndroid() || isWebViewGold()) && looksLikeImage(safeName)) {
    try {
      window.location.href = `savethisimage://?url=${encodeURIComponent(url)}`;
      return;
    } catch {
      // Fall through to the ordinary file link.
    }
  }

  triggerAnchorDownload(url, safeName);
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
  openDownloadUrl(url, fileName);
  return "direct";
};

/**
 * Download a generated public scan/photo. Phone app shells cannot reliably save
 * blob: or data: URLs, so on Android we first place the file behind a temporary
 * HTTPS URL from backend storage, then trigger the native downloader with that.
 */
export const downloadBlob = async (blob: Blob, fileName: string): Promise<DownloadResult> => {
  const safeName = safeFileName(fileName);

  const stamped: Blob = await Promise.race([
    watermarkBlob(blob, safeName).catch(() => blob),
    new Promise<Blob>((resolve) => setTimeout(() => resolve(blob), 1200)),
  ]);

  if (!isAndroid() && !isWebViewGold() && await writeWithFilePicker(stamped, safeName)) {
    return "file-picker";
  }

  if (isAndroid() || isWebViewGold()) {
    const preparedUrl = await preparePhoneDownloadUrl(stamped, safeName);
    if (preparedUrl) {
      openDownloadUrl(preparedUrl, safeName);
      return "prepared";
    }
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