// Client wrapper for the document processing web worker.
// Falls back gracefully if the worker isn't available (older WebViews):
// callers should catch errors and use their existing crop path.

import DocWorker from "@/workers/documentProcessor.worker?worker";

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt];

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (msg: any) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new DocWorker();
  worker.onmessage = (e: MessageEvent) => {
    const cb = pending.get(e.data.id);
    if (cb) { pending.delete(e.data.id); cb(e.data); }
  };
  worker.onerror = (err) => {
    console.warn("Document worker error:", err);
    // Reject all pending, terminate; next call will re-spawn.
    for (const [id, cb] of pending) {
      cb({ id, type: "error", error: "worker crashed" });
    }
    pending.clear();
    try { worker?.terminate(); } catch { /* ignore */ }
    worker = null;
  };
  return worker;
}

function send(msg: any, transfer: Transferable[] = [], timeoutMs = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try { w = getWorker(); } catch (e) { reject(e); return; }
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Document worker timeout"));
      }
    }, timeoutMs);
    pending.set(id, (res) => {
      clearTimeout(timer);
      if (res.type === "error") reject(new Error(res.error || "worker error"));
      else resolve(res);
    });
    try {
      w.postMessage({ ...msg, id }, transfer);
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(e as Error);
    }
  });
}

export async function detectDocumentCorners(
  imageData: ImageData
): Promise<{ corners: Quad | null; confidence: number }> {
  const res = await send({ type: "detectCorners", imageData });
  return { corners: res.corners, confidence: res.confidence };
}

export async function warpDocument(
  imageData: ImageData,
  corners: Quad,
  outW: number,
  outH: number,
  options: { adaptiveThreshold: boolean }
): Promise<ImageData> {
  const res = await send(
    { type: options.adaptiveThreshold ? "warpBW" : "warpColor", imageData, corners, outW, outH },
    [imageData.data.buffer]
  );
  return res.imageData as ImageData;
}

/** Compute reasonable output dimensions from source corners. */
export function estimateOutputSize(corners: Quad, maxSide = 1800): { outW: number; outH: number } {
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const topW = dist(corners[0], corners[1]);
  const botW = dist(corners[3], corners[2]);
  const leftH = dist(corners[0], corners[3]);
  const rightH = dist(corners[1], corners[2]);
  const w = Math.max(topW, botW);
  const h = Math.max(leftH, rightH);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { outW: Math.max(200, Math.round(w * scale)), outH: Math.max(200, Math.round(h * scale)) };
}

export function terminateProcessor() {
  try { worker?.terminate(); } catch { /* ignore */ }
  worker = null;
  pending.clear();
}
