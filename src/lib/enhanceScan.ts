/**
 * Local document scan enhancer — runs entirely in the browser, no AI calls.
 *
 * Pipeline:
 *  1. Auto white balance (gray-world)
 *  2. Shadow / vignette removal via large-radius background subtraction
 *  3. Adaptive contrast stretch (per-channel percentile)
 *  4. Mild unsharp mask for crisp text
 *
 * Works on a canvas image. Returns a new data URL.
 */

export interface EnhanceOptions {
  isIdScan?: boolean;
  /** Skip the heavier shadow-removal and sharpening passes for instant phone capture. */
  fast?: boolean;
  /** 0..1 – how aggressively to whiten the background. Default 0.85 */
  backgroundWhiteness?: number;
  /** 0..1 – sharpening strength. Default 0.35 */
  sharpenAmount?: number;
}

/**
 * Enhance a scanned document image in-place on a canvas.
 * The canvas is mutated and the same canvas is returned.
 */
export function enhanceScanCanvas(
  canvas: HTMLCanvasElement,
  options: EnhanceOptions = {}
): HTMLCanvasElement {
  const { isIdScan = false, fast = false } = options;
  // Use much gentler settings for IDs to preserve original colors (photo, holograms, stamps).
  const {
    backgroundWhiteness = isIdScan ? 0.25 : 0.85,
    sharpenAmount = fast ? 0 : isIdScan ? 0.12 : 0.35,
  } = options;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  if (w < 4 || h < 4) return canvas;

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return canvas;
  }
  const data = imageData.data;

  // ---------- 1. Gray-world auto white balance ----------
  let sumR = 0, sumG = 0, sumB = 0;
  const stride = 4 * 8; // sample every 8 pixels for speed
  let count = 0;
  for (let i = 0; i < data.length; i += stride) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    count++;
  }
  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;
  const gray = (avgR + avgG + avgB) / 3;
  const sR = avgR > 0 ? gray / avgR : 1;
  const sG = avgG > 0 ? gray / avgG : 1;
  const sB = avgB > 0 ? gray / avgB : 1;
  // Clamp to avoid extreme color casts
  const cR = Math.min(1.25, Math.max(0.85, sR));
  const cG = Math.min(1.25, Math.max(0.85, sG));
  const cB = Math.min(1.25, Math.max(0.85, sB));

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * cR);
    data[i + 1] = Math.min(255, data[i + 1] * cG);
    data[i + 2] = Math.min(255, data[i + 2] * cB);
  }

  if (!fast) {
    // ---------- 2. Shadow removal via downscaled background estimate ----------
    // Downscale heavily, blur, upscale → background illumination map.
    const bgScale = 0.08; // 8% size
    const bgW = Math.max(8, Math.round(w * bgScale));
    const bgH = Math.max(8, Math.round(h * bgScale));
    const bgCanvas = document.createElement("canvas");
    bgCanvas.width = bgW;
    bgCanvas.height = bgH;
    const bgCtx = bgCanvas.getContext("2d")!;
    bgCtx.imageSmoothingEnabled = true;
    bgCtx.imageSmoothingQuality = "high";

    // Put current (white-balanced) data into a temporary canvas to draw scaled
    ctx.putImageData(imageData, 0, 0);
    bgCtx.drawImage(canvas, 0, 0, bgW, bgH);
    // Slight blur via re-scaling for smoother background
    const bgCanvas2 = document.createElement("canvas");
    bgCanvas2.width = bgW;
    bgCanvas2.height = bgH;
    const bgCtx2 = bgCanvas2.getContext("2d")!;
    bgCtx2.filter = "blur(2px)";
    bgCtx2.drawImage(bgCanvas, 0, 0);

    // Upscale background to full size
    const bgFull = document.createElement("canvas");
    bgFull.width = w;
    bgFull.height = h;
    const bgFullCtx = bgFull.getContext("2d")!;
    bgFullCtx.imageSmoothingEnabled = true;
    bgFullCtx.imageSmoothingQuality = "high";
    bgFullCtx.drawImage(bgCanvas2, 0, 0, w, h);

    let bgData: ImageData;
    try {
      bgData = bgFullCtx.getImageData(0, 0, w, h);
    } catch {
      return canvas;
    }
    const bg = bgData.data;

    // Divide image by background, scale to white. Pixels brighter than bg become near-white.
    const wMix = backgroundWhiteness;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const px = data[i + c];
        const bgPx = bg[i + c] || 1;
        // Normalized: ratio of pixel to local background, scaled so background = 255
        const corrected = (px / bgPx) * 255;
        // Blend with original to avoid over-correction destroying ink
        data[i + c] = Math.min(255, Math.max(0, corrected * wMix + px * (1 - wMix)));
      }
    }
  }

  // ---------- 3. Contrast stretch (percentile based, per channel) ----------
  // Find low/high percentile to remap. Use gentler cuts on IDs to keep colors.
  const lowPct = isIdScan ? 0.005 : 0.02;
  const highPct = isIdScan ? 0.995 : 0.98;
  // For IDs, blend stretched result with original so colors are preserved.
  const stretchMix = isIdScan ? 0.4 : 1.0;
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = c; i < data.length; i += 4) {
      hist[data[i]]++;
    }
    const total = w * h;
    const lowCut = total * lowPct;
    const highCut = total * highPct;
    let lo = 0, hi = 255;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= lowCut) { lo = v; break; }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= highCut) { hi = v; break; }
    }
    if (hi - lo < 20) continue; // skip if range is tiny (avoid amplifying noise)
    const scale = 255 / (hi - lo);
    for (let i = c; i < data.length; i += 4) {
      const orig = data[i];
      const v = (orig - lo) * scale;
      const clamped = v < 0 ? 0 : v > 255 ? 255 : v;
      data[i] = clamped * stretchMix + orig * (1 - stretchMix);
    }
  }

  // ---------- 4. Unsharp mask (single-pass approximation) ----------
  if (sharpenAmount > 0) {
    const copy = new Uint8ClampedArray(data);
    const a = sharpenAmount;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const neighbors =
            copy[((y - 1) * w + x) * 4 + c] +
            copy[((y + 1) * w + x) * 4 + c] +
            copy[(y * w + x - 1) * 4 + c] +
            copy[(y * w + x + 1) * 4 + c];
          const sharp = 5 * center - neighbors;
          const v = center * (1 - a) + sharp * a;
          data[idx + c] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Enhance a data URL (base64) image and return a new data URL.
 */
export async function enhanceScanDataUrl(
  dataUrl: string,
  options: EnhanceOptions = {}
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);
      try {
        enhanceScanCanvas(canvas, options);
      } catch {
        // Fallback: return original
        resolve(dataUrl);
        return;
      }
      // Use JPEG to keep file size reasonable for scans
      const isPng = dataUrl.startsWith("data:image/png");
      resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
