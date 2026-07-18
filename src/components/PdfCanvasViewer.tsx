import { useEffect, useRef, useState } from "react";
import "@/lib/polyfills";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Set worker once for the whole app
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface Props {
  url: string;
  className?: string;
}

/**
 * Reliable in-app PDF renderer using pdf.js.
 *
 * Renders EVERY page stacked vertically inside a scroll container so the
 * user reads the document by scrolling top → bottom (never sideways).
 * Pages render lazily as they come into view to keep memory usage sane
 * on old / low-end phones.
 */
export default function PdfCanvasViewer({ url, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (e: any) {
        console.error("PDF load error", e);
        if (!cancelled) setError("Could not load this PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return (
      <div className="w-full h-[70vh] flex items-center justify-center text-muted-foreground text-sm border border-border rounded-md bg-card">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className || "w-full h-[80vh] overflow-y-auto overflow-x-hidden bg-white rounded-md border border-border"}>
      <div className="w-full flex flex-col items-center gap-3 p-2">
        {pdfDoc && Array.from({ length: numPages }, (_, i) => (
          <PdfPage key={i + 1} pdfDoc={pdfDoc} pageNumber={i + 1} zoom={zoom} scrollParent={containerRef.current} />
        ))}
        <div className="sticky bottom-2 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5 z-10 self-center">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-white text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setZoom((z) => Math.min(5, z + 0.2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {numPages > 1 && (
            <span className="text-white/70 text-xs pl-2 border-l border-white/20 ml-1">{numPages} pages</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Single PDF page — renders lazily when scrolled into view. Reserves the
 * correct aspect ratio up front so scrolling doesn't jump as pages render.
 */
function PdfPage({
  pdfDoc,
  pageNumber,
  zoom,
  scrollParent,
}: {
  pdfDoc: any;
  pageNumber: number;
  zoom: number;
  scrollParent: HTMLElement | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [visible, setVisible] = useState(pageNumber <= 2); // eager-render first 2 pages
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Fetch page metadata once so we can reserve height even before rendering.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        setSize({ w: vp.width, h: vp.height });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNumber]);

  // Lazy render: mark visible when the wrapper enters the viewport.
  useEffect(() => {
    if (visible || !wrapRef.current) return;
    const el = wrapRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { setVisible(true); io.disconnect(); break; }
      }
    }, { root: scrollParent || null, rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, scrollParent]);

  // Render the page onto the canvas whenever visible/zoom changes.
  useEffect(() => {
    if (!visible || !pdfDoc || !canvasRef.current || !wrapRef.current) return;
    let cancelled = false;
    (async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        renderTaskRef.current = null;
      }
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const wrap = wrapRef.current;
        if (!wrap || cancelled) return;
        const unscaled = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssScale = (wrap.clientWidth / unscaled.width) * zoom;
        const viewport = page.getViewport({ scale: cssScale * dpr });
        const cssViewport = page.getViewport({ scale: cssScale });
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;
        const ctx = canvas.getContext("2d")!;
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("PDF render error", err);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        renderTaskRef.current = null;
      }
    };
  }, [visible, pdfDoc, pageNumber, zoom]);

  // Reserved height keeps scrolling stable while the page is not yet rendered.
  const reservedAspect = size ? size.h / size.w : 1.414; // default to A4 portrait
  return (
    <div
      ref={wrapRef}
      className="w-full max-w-full shadow-sm bg-white"
      style={{
        aspectRatio: visible ? undefined : `${1} / ${reservedAspect}`,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", margin: "0 auto", maxWidth: "100%" }} />
      {!visible && (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
          Loading page {pageNumber}…
        </div>
      )}
    </div>
  );
}
