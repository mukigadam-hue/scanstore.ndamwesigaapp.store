import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, Music, Video, File, ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FilePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  document: {
    id: string;
    name: string;
    file_path: string;
    file_size: number;
    file_type: string;
  } | null;
  onDownload: () => void;
}

const FilePreviewDialog = ({ open, onClose, document: doc, onDownload }: FilePreviewDialogProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pinch-to-zoom state
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(1);

  useEffect(() => {
    if (!open || !doc) {
      setPreviewUrl(null);
      setZoom(1);
      setIsFullscreen(false);
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from("documents")
          .download(doc.file_path);

        if (error) {
          toast.error("Failed to load preview");
          return;
        }

        const url = URL.createObjectURL(data);
        setPreviewUrl(url);
      } catch {
        toast.error("Could not preview this file");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();

    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [open, doc?.id]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (isFullscreen) setShowControls(false);
    }, 3000);
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) resetControlsTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [isFullscreen, resetControlsTimer]);

  // Pinch-to-zoom handlers
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches);
      setPinchStartDist(dist);
      setPinchStartZoom(zoom);
    }
    resetControlsTimer();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const dist = getTouchDistance(e.touches);
      const scale = dist / pinchStartDist;
      setZoom(Math.max(0.5, Math.min(5, pinchStartZoom * scale)));
    }
  };

  const handleTouchEnd = () => {
    setPinchStartDist(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.5, Math.min(5, z + delta)));
    }
  };

  if (!doc) return null;

  const isImage = doc.file_type.startsWith("image/");
  const isPdf = doc.file_type.includes("pdf");
  const isVideo = doc.file_type.startsWith("video/");
  const isAudio = doc.file_type.startsWith("audio/");
  const isWord = doc.file_type.includes("word") || doc.file_type.includes("msword") || doc.name.endsWith(".docx") || doc.name.endsWith(".doc");

  const dialogClasses = isFullscreen
    ? "fixed inset-0 max-w-none w-full h-full rounded-none bg-background border-none z-[100] flex flex-col"
    : "max-w-[95vw] sm:max-w-3xl max-h-[90vh] bg-card border-border overflow-hidden flex flex-col";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={dialogClasses}>
        {/* Controls bar */}
        <div
          className={`flex-shrink-0 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={resetControlsTimer}
        >
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <DialogTitle className="font-display brass-text text-base sm:text-lg truncate pr-2">
                  {doc.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {isFullscreen ? "Pinch or scroll to zoom • Tap to show controls" : "Preview your stored document"}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(isImage || isPdf) && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Zoom out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground w-10 text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Zoom in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setIsFullscreen(!isFullscreen);
                    setZoom(1);
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  onClick={onDownload}
                  className="brass-gradient text-primary-foreground hover:opacity-90 h-8 px-2 sm:px-3"
                >
                  <Download className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Content area with touch/zoom */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto min-h-0 touch-manipulation"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          onClick={resetControlsTimer}
        >
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : previewUrl ? (
            <div className="flex items-center justify-center min-h-full">
              {isImage && (
                <img
                  src={previewUrl}
                  alt={doc.name}
                  className="max-w-full object-contain rounded-lg select-none"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                    maxHeight: isFullscreen ? "100vh" : "70vh",
                    transition: pinchStartDist ? "none" : "transform 0.15s ease",
                  }}
                  draggable={false}
                />
              )}
              {isPdf && (
                <iframe
                  src={previewUrl}
                  className="w-full rounded-lg border border-border"
                  style={{
                    height: isFullscreen ? "100vh" : "70vh",
                    transform: `scale(${zoom})`,
                    transformOrigin: "top center",
                    transition: pinchStartDist ? "none" : "transform 0.15s ease",
                  }}
                  title={doc.name}
                />
              )}
              {isVideo && (
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full rounded-lg"
                  style={{ maxHeight: isFullscreen ? "100vh" : "70vh" }}
                />
              )}
              {isAudio && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Music className="h-16 w-16 text-primary" />
                  <p className="text-foreground font-display text-lg">{doc.name}</p>
                  <audio src={previewUrl} controls className="w-full max-w-md" />
                </div>
              )}
              {isWord && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <FileText className="h-16 w-16 text-primary" />
                  <p className="text-foreground font-display">{doc.name}</p>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    Word documents can be viewed by downloading. Tap download to open in your device's document viewer.
                  </p>
                  <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                    <Download className="h-4 w-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              )}
              {!isImage && !isPdf && !isVideo && !isAudio && !isWord && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <File className="h-16 w-16 text-muted-foreground" />
                  <p className="text-foreground font-display">{doc.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Tap download to open with your device's viewer
                  </p>
                  <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                    <Download className="h-4 w-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <FileText className="h-16 w-16 text-muted-foreground/30" />
              <p className="text-muted-foreground">Unable to load preview</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FilePreviewDialog;
