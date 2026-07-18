import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw, X } from "lucide-react";
import type { Quad, Pt } from "@/lib/documentProcessor";

interface ManualCropScreenProps {
  open: boolean;
  imageUrl: string;
  onConfirm: (corners: Quad, imageSize: { width: number; height: number }) => void;
  onRetake: () => void;
  onCancel: () => void;
}

/**
 * Post-capture manual crop adjuster. Shows the full-color photo with 4
 * draggable corner dots. Emits corners in SOURCE-IMAGE pixel coordinates
 * so the caller can pass them directly to the warp worker.
 */
export default function ManualCropScreen({
  open,
  imageUrl,
  onConfirm,
  onRetake,
  onCancel,
}: ManualCropScreenProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number; offX: number; offY: number }>({
    w: 0, h: 0, offX: 0, offY: 0,
  });
  // Corners stored in source-image pixel space.
  const [corners, setCorners] = useState<Quad | null>(null);

  // Load image and initialize corners at 6% inset from each edge.
  useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      setImgSize({ width: w, height: h });
      const inset = Math.min(w, h) * 0.06;
      setCorners([
        { x: inset, y: inset },
        { x: w - inset, y: inset },
        { x: w - inset, y: h - inset },
        { x: inset, y: h - inset },
      ]);
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  // Recompute displayed image bounds (object-contain) so we can map between
  // source pixels and CSS coordinates for the draggable dots.
  useEffect(() => {
    if (!open || !imgSize) return;
    const compute = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const arImg = imgSize.width / imgSize.height;
      const arBox = rect.width / rect.height;
      let dispW: number, dispH: number;
      if (arImg > arBox) { dispW = rect.width; dispH = rect.width / arImg; }
      else { dispH = rect.height; dispW = rect.height * arImg; }
      const offX = (rect.width - dispW) / 2;
      const offY = (rect.height - dispH) / 2;
      setDisplaySize({ w: dispW, h: dispH, offX, offY });
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("orientationchange", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", compute);
    };
  }, [open, imgSize]);

  const srcToCss = (p: Pt): Pt => {
    if (!imgSize) return { x: 0, y: 0 };
    const sx = (p.x / imgSize.width) * displaySize.w + displaySize.offX;
    const sy = (p.y / imgSize.height) * displaySize.h + displaySize.offY;
    return { x: sx, y: sy };
  };

  const cssToSrc = (cx: number, cy: number): Pt => {
    if (!imgSize) return { x: 0, y: 0 };
    const nx = Math.max(0, Math.min(displaySize.w, cx - displaySize.offX));
    const ny = Math.max(0, Math.min(displaySize.h, cy - displaySize.offY));
    return {
      x: (nx / Math.max(1, displaySize.w)) * imgSize.width,
      y: (ny / Math.max(1, displaySize.h)) * imgSize.height,
    };
  };

  const startDrag = (idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const next = cssToSrc(cx, cy);
      setCorners((cur) => {
        if (!cur) return cur;
        const copy = [...cur] as Quad;
        copy[idx] = next;
        return copy;
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Midpoint drag: translates the two adjacent corners together by the drag delta,
  // so the edge extends/contracts as a whole.
  const startEdgeDrag = (edgeIdx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const container = containerRef.current;
    if (!container || !corners) return;
    const rect = container.getBoundingClientRect();
    const a = corners[edgeIdx];
    const b = corners[(edgeIdx + 1) % 4];
    const startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const startA = { ...a };
    const startB = { ...b };

    const onMove = (ev: PointerEvent) => {
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const cur = cssToSrc(cx, cy);
      const dx = cur.x - startMid.x;
      const dy = cur.y - startMid.y;
      setCorners((prev) => {
        if (!prev) return prev;
        const copy = [...prev] as Quad;
        copy[edgeIdx] = { x: startA.x + dx, y: startA.y + dy };
        copy[(edgeIdx + 1) % 4] = { x: startB.x + dx, y: startB.y + dy };
        return copy;
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const polygonPoints = useMemo(() => {
    if (!corners) return "";
    return corners.map((p) => {
      const c = srcToCss(p);
      return `${c.x},${c.y}`;
    }).join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corners, displaySize, imgSize]);

  if (!open) return null;

  const overlay = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="bg-black/85 backdrop-blur-sm px-3 py-2 flex items-center justify-between safe-area-top">
        <h3 className="text-white text-sm font-medium">Adjust corners</h3>
        <Button size="icon" variant="ghost" onClick={onCancel} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="px-4 pt-2 pb-1 text-center">
        <p className="text-white/75 text-xs">
          Drag the 4 amber dots to the exact corners of your document. Colors, stamps and signatures are preserved.
        </p>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Captured document"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
        {corners && imgSize && displaySize.w > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ touchAction: "none" }}
          >
            <polygon
              points={polygonPoints}
              fill="rgba(251, 191, 36, 0.12)"
              stroke="#fbbf24"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
        )}
        {corners && corners.map((p, idx) => {
          const c = srcToCss(p);
          return (
            <div
              key={idx}
              onPointerDown={(e) => startDrag(idx, e)}
              className="absolute rounded-full bg-amber-400 border-2 border-black shadow-lg touch-none cursor-grab active:cursor-grabbing"
              style={{
                left: c.x - 16,
                top: c.y - 16,
                width: 32,
                height: 32,
                zIndex: 5,
              }}
            >
              <div className="absolute inset-1 rounded-full bg-black/25" />
            </div>
          );
        })}
        {corners && corners.map((_, edgeIdx) => {
          const a = corners[edgeIdx];
          const b = corners[(edgeIdx + 1) % 4];
          const mid = srcToCss({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          return (
            <div
              key={`mid-${edgeIdx}`}
              onPointerDown={(e) => startEdgeDrag(edgeIdx, e)}
              className="absolute rounded-full bg-amber-200 border-2 border-black shadow-md touch-none cursor-grab active:cursor-grabbing"
              style={{
                left: mid.x - 12,
                top: mid.y - 12,
                width: 24,
                height: 24,
                zIndex: 4,
              }}
            >
              <div className="absolute inset-1 rounded-full bg-black/20" />
            </div>
          );
        })}
      </div>

      <div className="bg-black/85 backdrop-blur-sm px-4 py-3 safe-area-bottom">
        <div className="flex items-center gap-2 max-w-sm mx-auto">
          <Button
            onClick={() => corners && imgSize && onConfirm(corners, imgSize)}
            disabled={!corners || !imgSize}
            className="flex-[1.4] brass-gradient text-primary-foreground hover:opacity-90"
          >
            <Check className="h-4 w-4 mr-2" />
            Confirm
          </Button>
          <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" onClick={onRetake}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Retake
          </Button>
          <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
