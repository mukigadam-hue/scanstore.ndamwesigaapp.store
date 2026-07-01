// Adds a small app-icon + app-ID watermark to the bottom-left corner of
// scanned/snapped/uploaded files at download/share time.
// Supports images (any raster type) and PDFs. Other file types pass through.

const APP_ID = "com.scanstore.app";
const ICON_URL = "/icons/icon-192.png";

let iconPromise: Promise<HTMLImageElement | null> | null = null;
const loadIcon = (): Promise<HTMLImageElement | null> => {
  if (iconPromise) return iconPromise;
  iconPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = ICON_URL;
  });
  return iconPromise;
};

const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

const drawWatermark = (
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  icon: HTMLImageElement | null
) => {
  // Scale watermark to ~7% of shortest side, min 28px, max 64px.
  const base = Math.min(W, H);
  const iconSize = Math.max(28, Math.min(64, Math.round(base * 0.07)));
  const pad = Math.max(8, Math.round(base * 0.015));
  const font = Math.max(10, Math.round(iconSize * 0.36));

  ctx.save();
  ctx.font = `600 ${font}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const textW = ctx.measureText(APP_ID).width;
  const boxW = iconSize + 6 + textW + pad;
  const boxH = iconSize + Math.round(pad * 0.6);
  const x = pad;
  const y = H - boxH - pad;

  // Semi-transparent rounded background so it stays legible without shadowing content.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#000";
  const r = Math.round(boxH / 4);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  if (icon) {
    ctx.drawImage(icon, x + 4, y + Math.round((boxH - iconSize) / 2), iconSize, iconSize);
  }
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(APP_ID, x + iconSize + 8, y + boxH / 2);
  ctx.restore();
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))),
      type,
      quality
    );
  });

const watermarkImage = async (blob: Blob): Promise<Blob> => {
  try {
    const [img, icon] = await Promise.all([loadImageFromBlob(blob), loadIcon()]);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0);
    drawWatermark(ctx, canvas.width, canvas.height, icon);
    const type = blob.type && blob.type !== "image/gif" ? blob.type : "image/png";
    const quality = type === "image/jpeg" || type === "image/webp" ? 0.92 : undefined;
    return await canvasToBlob(canvas, type, quality);
  } catch {
    return blob;
  }
};

const watermarkPdf = async (blob: Blob): Promise<Blob> => {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const buf = await blob.arrayBuffer();
    const pdf = await PDFDocument.load(buf);
    const icon = await loadIcon();
    let iconImage: any = null;
    if (icon) {
      const resp = await fetch(ICON_URL);
      const ib = await resp.arrayBuffer();
      iconImage = await pdf.embedPng(ib);
    }
    const font = await pdf.embedFont((await import("pdf-lib")).StandardFonts.HelveticaBold);
    const pages = pdf.getPages();
    for (const p of pages) {
      const { width, height } = p.getSize();
      const base = Math.min(width, height);
      const iconSize = Math.max(20, Math.min(48, base * 0.06));
      const pad = Math.max(6, base * 0.015);
      const fontSize = Math.max(8, iconSize * 0.36);
      const textW = font.widthOfTextAtSize(APP_ID, fontSize);
      const boxW = iconSize + 6 + textW + pad;
      const boxH = iconSize + pad * 0.6;
      const x = pad;
      const y = pad;
      p.drawRectangle({
        x, y, width: boxW, height: boxH,
        color: (await import("pdf-lib")).rgb(0, 0, 0),
        opacity: 0.55,
      });
      if (iconImage) {
        p.drawImage(iconImage, {
          x: x + 4,
          y: y + (boxH - iconSize) / 2,
          width: iconSize,
          height: iconSize,
        });
      }
      p.drawText(APP_ID, {
        x: x + iconSize + 8,
        y: y + boxH / 2 - fontSize / 2 + 1,
        size: fontSize,
        font,
        color: (await import("pdf-lib")).rgb(1, 1, 1),
      });
    }
    const out = await pdf.save();
    return new Blob([out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer], { type: "application/pdf" });
  } catch {
    return blob;
  }
};

export const watermarkBlob = async (blob: Blob, fileName?: string): Promise<Blob> => {
  const name = (fileName || "").toLowerCase();
  const type = blob.type || "";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name)) {
    return watermarkImage(blob);
  }
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return watermarkPdf(blob);
  }
  return blob;
};
