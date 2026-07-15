/// <reference lib="webworker" />
// Document processing worker: corner detection, 4-point perspective warp,
// and adaptive thresholding. Keeps the UI thread at 60 FPS.

declare const self: DedicatedWorkerGlobalScope;

type Pt = { x: number; y: number };
type Quad = [Pt, Pt, Pt, Pt];

// ---- Otsu threshold on a grayscale buffer ---------------------------------
function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; threshold = t; }
  }
  return threshold;
}

// ---- Corner detection ----------------------------------------------------
// Downsamples to ~320 wide, runs Otsu, and picks the 4 extreme foreground
// points (TL = min x+y, TR = max x−y, BR = max x+y, BL = min x−y).
// Assumes the document is the light (or dark) dominant region.
function detectCorners(img: ImageData): { corners: Quad | null; confidence: number } {
  const { data, width: W, height: H } = img;
  const targetW = 320;
  const sW = Math.max(80, Math.min(targetW, W));
  const scale = sW / W;
  const sH = Math.max(60, Math.round(H * scale));
  const gray = new Uint8ClampedArray(sW * sH);
  const stepX = W / sW, stepY = H / sH;
  for (let y = 0; y < sH; y++) {
    const sy = Math.floor(y * stepY);
    const row = sy * W;
    for (let x = 0; x < sW; x++) {
      const sx = Math.floor(x * stepX);
      const i = (row + sx) * 4;
      gray[y * sW + x] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
  }

  const t = otsuThreshold(gray);
  // Choose brighter class as foreground when its mean > darker class mean
  // (paper documents are almost always the lighter side).
  let sumL = 0, cntL = 0, sumH = 0, cntH = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < t) { sumL += gray[i]; cntL++; }
    else { sumH += gray[i]; cntH++; }
  }
  const fgIsHigh = cntL && cntH ? (sumH / cntH) > (sumL / cntL) : true;

  let tl: Pt | null = null, tr: Pt | null = null, br: Pt | null = null, bl: Pt | null = null;
  let tlS = Infinity, trS = -Infinity, brS = -Infinity, blS = Infinity;
  let count = 0, minX = sW, minY = sH, maxX = 0, maxY = 0;

  const margin = 2;
  for (let y = margin; y < sH - margin; y++) {
    for (let x = margin; x < sW - margin; x++) {
      const px = gray[y * sW + x];
      const fg = fgIsHigh ? px >= t : px < t;
      if (!fg) continue;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      const sPlus = x + y;
      const sMinus = x - y;
      if (sPlus < tlS) { tlS = sPlus; tl = { x, y }; }
      if (sPlus > brS) { brS = sPlus; br = { x, y }; }
      if (sMinus > trS) { trS = sMinus; tr = { x, y }; }
      if (sMinus < blS) { blS = sMinus; bl = { x, y }; }
    }
  }

  if (!tl || !tr || !br || !bl) return { corners: null, confidence: 0 };

  const bbW = maxX - minX, bbH = maxY - minY;
  const fgRatio = count / (sW * sH);
  let confidence = 0;

  if (fgRatio > 0.18 && fgRatio < 0.94 && bbW > sW * 0.4 && bbH > sH * 0.4) {
    // Penalize corners sitting on the image edge — likely means the document runs off-screen.
    const edgeMargin = 3;
    const onEdge = (p: Pt) =>
      p.x <= edgeMargin || p.y <= edgeMargin || p.x >= sW - 1 - edgeMargin || p.y >= sH - 1 - edgeMargin;
    const edgeHits = [tl, tr, br, bl].filter(onEdge).length;

    // Convexity: cross products of consecutive edges should all share sign.
    const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const c1 = cross(tl, tr, br);
    const c2 = cross(tr, br, bl);
    const c3 = cross(br, bl, tl);
    const c4 = cross(bl, tl, tr);
    const convex = (c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) || (c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0);

    if (convex) {
      const spanX = Math.min(tr.x, br.x) - Math.max(tl.x, bl.x);
      const spanY = Math.min(bl.y, br.y) - Math.max(tl.y, tr.y);
      const spanScore = Math.max(0, Math.min(1, (spanX * spanY) / (sW * sH * 0.35)));
      confidence = Math.max(0, spanScore * (1 - edgeHits * 0.28));
    }
  }

  // Upscale corner coordinates back to source image space.
  const upX = W / sW, upY = H / sH;
  const up = (p: Pt): Pt => ({ x: p.x * upX, y: p.y * upY });
  return { corners: [up(tl), up(tr), up(br), up(bl)], confidence };
}

// ---- 4-point homography solver -------------------------------------------
// Solves for H such that dst = H · src. Returns the 8 params [a..h].
function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const n = 8;
  const M: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    M.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx, dx]);
    M.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy, dy]);
  }
  // Gauss-Jordan elimination
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    if (Math.abs(M[i][i]) < 1e-10) return [1, 0, 0, 0, 1, 0, 0, 0];
    const div = M[i][i];
    for (let j = i; j <= n; j++) M[i][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      if (!f) continue;
      for (let j = i; j <= n; j++) M[r][j] -= f * M[i][j];
    }
  }
  return [M[0][n], M[1][n], M[2][n], M[3][n], M[4][n], M[5][n], M[6][n], M[7][n]];
}

// ---- Perspective warp with bilinear sampling -----------------------------
function warpImage(img: ImageData, srcCorners: Quad, outW: number, outH: number): ImageData {
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  // We iterate over the output and sample from source, so solve dst → src.
  const h = solveHomography(dst, srcCorners as unknown as Pt[]);
  const a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  const out = new ImageData(outW, outH);
  const src = img.data;
  const sW = img.width, sH = img.height;
  const od = out.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = g * x + hh * y + 1;
      const sx = (a * x + b * y + c) / w;
      const sy = (d * x + e * y + f) / w;
      const oIdx = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sW - 1 || sy >= sH - 1) {
        od[oIdx] = 255; od[oIdx + 1] = 255; od[oIdx + 2] = 255; od[oIdx + 3] = 255;
        continue;
      }
      const x0 = sx | 0, y0 = sy | 0;
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sW * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      od[oIdx]     = src[i00]     * w00 + src[i10]     * w10 + src[i01]     * w01 + src[i11]     * w11;
      od[oIdx + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      od[oIdx + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      od[oIdx + 3] = 255;
    }
  }
  return out;
}

// ---- Bradley-Roth adaptive threshold (in place) --------------------------
function adaptiveThreshold(img: ImageData, t = 0.15): void {
  const W = img.width, H = img.height;
  const s = Math.max(8, Math.floor(W / 16));
  const half = s >> 1;
  const data = img.data;
  const N = W * H;
  const gray = new Uint16Array(N);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  const II = new Float64Array(N);
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      rowSum += gray[idx];
      II[idx] = (y > 0 ? II[idx - W] : 0) + rowSum;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x1 = Math.max(0, x - half), y1 = Math.max(0, y - half);
      const x2 = Math.min(W - 1, x + half), y2 = Math.min(H - 1, y + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const A = (x1 > 0 && y1 > 0) ? II[(y1 - 1) * W + (x1 - 1)] : 0;
      const B = (y1 > 0) ? II[(y1 - 1) * W + x2] : 0;
      const C = (x1 > 0) ? II[y2 * W + (x1 - 1)] : 0;
      const D = II[y2 * W + x2];
      const sum = D - B - C + A;
      const idx = y * W + x;
      const px = gray[idx];
      const isBg = px * count > sum * (1 - t);
      const v = isBg ? 255 : 0;
      const p = idx * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
      data[p + 3] = 255;
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "detectCorners") {
      const res = detectCorners(msg.imageData);
      (self as any).postMessage({ id: msg.id, type: "corners", corners: res.corners, confidence: res.confidence });
    } else if (msg.type === "warpColor" || msg.type === "warpBW") {
      const out = warpImage(msg.imageData, msg.corners, msg.outW, msg.outH);
      if (msg.type === "warpBW") adaptiveThreshold(out, 0.15);
      (self as any).postMessage({ id: msg.id, type: "warped", imageData: out }, [out.data.buffer]);
    } else {
      (self as any).postMessage({ id: msg.id, type: "error", error: "Unknown message type" });
    }
  } catch (err: any) {
    (self as any).postMessage({ id: msg.id, type: "error", error: err?.message ?? String(err) });
  }
};

export {};
