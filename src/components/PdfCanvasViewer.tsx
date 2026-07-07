import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
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
 * Reliable in-app PDF renderer using pdf.js (works on mobile browsers
 * where <iframe src="*.pdf"> renders blank).
 */
export default function PdfCanvasViewer({ url, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPdfDoc(null);
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
      } catch (e: any) {
        console.error("PDF load error", e);
        if (!cancelled) setError("Could not load this PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;

    const render = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        renderTaskRef.current = null;
      }
      try {
        const page = await pdfDoc.getPage(currentPage);
        const container = containerRef.current;
        if (!container || cancelled) return;
        const unscaled = page.getViewport({ scale: 1 });
        // Account for device pixel ratio so high-DPI mobile screens render crisp,
        // not blurred. Cap DPR at 3 to keep memory sane for large PDFs.
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const cssScale = (container.clientWidth / unscaled.width) * zoom;
        const renderScale = cssScale * dpr;
        const viewport = page.getViewport({ scale: renderScale });
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
    };

    render();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, currentPage, zoom]);

  if (error) {
    return (
      <div className="w-full h-[70vh] flex items-center justify-center text-muted-foreground text-sm border border-border rounded-md bg-card">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className || "w-full h-[80vh] overflow-auto bg-white rounded-md border border-border"}>
      <div className="min-w-full min-h-full flex flex-col items-center justify-center p-2">
        <canvas ref={canvasRef} style={{ display: "block", margin: "auto" }} />
        <div className="sticky bottom-2 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5 mt-2 z-10">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-white text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setZoom((z) => Math.min(5, z + 0.2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {numPages > 1 && (
            <>
              <span className="text-white/40">|</span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-white text-xs">{currentPage} / {numPages}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white" onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
