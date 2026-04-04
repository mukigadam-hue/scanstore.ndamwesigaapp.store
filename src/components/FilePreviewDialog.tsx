import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, Music, Video, File, ZoomIn, ZoomOut } from "lucide-react";
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
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pinch-to-zoom state
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(1);

  useEffect(() => {
    if (!open || !doc) {
      setPreviewUrl(null);
      setZoom(1);
      return;
    }

    let revoked = false;
    const loadPreview = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.file_path, 3600);

        if (error || !data?.signedUrl) {
          toast.error("Failed to load preview");
          return;
        }

        if (!revoked) setPreviewUrl(data.signedUrl);
      } catch {
        toast.error("Could not preview this file");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();

    return () => {
      revoked = true;
    };
  }, [open, doc?.id]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (open) resetControlsTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [open, resetControlsTimer]);

  // ESC key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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

  if (!open || !doc) return null;

  const isImage = doc.file_type.startsWith("image/");
  const isPdf = doc.file_type.includes("pdf");
  const isVideo = doc.file_type.startsWith("video/");
  const isAudio = doc.file_type.startsWith("audio/");
  
  // Text-based formats that can be rendered inline
  const isPlainText = doc.file_type.startsWith("text/") || 
    doc.name.endsWith(".txt") || doc.name.endsWith(".csv") || doc.name.endsWith(".json") ||
    doc.name.endsWith(".xml") || doc.name.endsWith(".md") || doc.name.endsWith(".rtf") ||
    doc.name.endsWith(".log") || doc.name.endsWith(".html") || doc.name.endsWith(".htm");

  // Office documents viewable via Google Docs Viewer
  const officeExtensions = [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"];
  const isOfficeDoc = doc.file_type.includes("word") || doc.file_type.includes("msword") ||
    doc.file_type.includes("spreadsheet") || doc.file_type.includes("excel") ||
    doc.file_type.includes("presentation") || doc.file_type.includes("powerpoint") ||
    doc.file_type.includes("opendocument") ||
    officeExtensions.some(ext => doc.name.toLowerCase().endsWith(ext));
  
  const googleViewerUrl = isOfficeDoc && previewUrl
    ? `https://docs.google.com/gview?url=${encodeURIComponent(previewUrl)}&embedded=true`
    : null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onClick={resetControlsTimer}
    >
      {/* Top controls bar - always accessible close button */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
        }`}
      >
        <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2 safe-area-top">
          <h3 className="text-white text-sm font-medium truncate flex-1 mr-2">
            {doc.name}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {(isImage || isPdf) && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-white/70 w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
                  className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={onDownload}
              className="brass-gradient text-primary-foreground hover:opacity-90 h-8 px-3"
            >
              <Download className="h-4 w-4 mr-1" />
              Save
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Persistent close button - always visible */}
      <button
        onClick={onClose}
        className={`absolute top-3 right-3 z-20 h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 hover:text-white transition-all ${
          showControls ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Content area */}
      <div
        className="flex-1 overflow-auto touch-manipulation flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        {loading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          </div>
        ) : previewUrl ? (
          <>
            {isImage && (
              <img
                src={previewUrl}
                alt={doc.name}
                className="max-w-full max-h-full object-contain select-none"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: pinchStartDist ? "none" : "transform 0.15s ease",
                }}
                draggable={false}
              />
            )}
            {isPdf && (
              <iframe
                src={previewUrl + "#toolbar=1&view=FitH"}
                className="w-full h-full border-none bg-white"
                title={doc.name}
              />
            )}
            {isVideo && (
              <video
                src={previewUrl}
                controls
                className="max-w-full max-h-full"
              />
            )}
            {isAudio && (
              <div className="flex flex-col items-center gap-4 p-8">
                <Music className="h-16 w-16 text-primary" />
                <p className="text-white text-lg">{doc.name}</p>
                <audio src={previewUrl} controls className="w-full max-w-md" />
              </div>
            )}
            {isWord && (
              <div className="flex flex-col items-center gap-4 p-8">
                <FileText className="h-16 w-16 text-primary" />
                <p className="text-white">{doc.name}</p>
                <p className="text-sm text-white/60 text-center max-w-xs">
                  Word documents can be viewed by downloading.
                </p>
                <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                  <Download className="h-4 w-4 mr-2" />
                  Download to view
                </Button>
              </div>
            )}
            {!isImage && !isPdf && !isVideo && !isAudio && !isWord && (
              <div className="flex flex-col items-center gap-4 p-8">
                <File className="h-16 w-16 text-white/30" />
                <p className="text-white">{doc.name}</p>
                <p className="text-sm text-white/60">
                  Tap download to open with your device's viewer
                </p>
                <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                  <Download className="h-4 w-4 mr-2" />
                  Download to view
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <FileText className="h-16 w-16 text-white/20" />
            <p className="text-white/50">Unable to load preview</p>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default FilePreviewDialog;
