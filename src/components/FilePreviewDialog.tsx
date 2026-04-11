import { useState, useEffect, useRef, useCallback } from "react";
import { useAdPrefetch } from "@/hooks/useAdPrefetch";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, Music, Video, File, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
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

const TEXT_EXTENSIONS = [".txt", ".csv", ".json", ".xml", ".md", ".rtf", ".log", ".html", ".htm", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env", ".sh", ".bat", ".ps1", ".py", ".js", ".ts", ".jsx", ".tsx", ".css", ".scss", ".sql", ".r", ".rb", ".php", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".swift", ".kt"];

const OFFICE_EXTENSIONS = [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"];

const isTextFile = (name: string, fileType: string) => {
  const lower = name.toLowerCase();
  return fileType.startsWith("text/") ||
    fileType === "application/json" ||
    fileType === "application/xml" ||
    TEXT_EXTENSIONS.some(ext => lower.endsWith(ext));
};

const isOfficeFile = (name: string, fileType: string) => {
  const lower = name.toLowerCase();
  return fileType.includes("word") || fileType.includes("msword") ||
    fileType.includes("spreadsheet") || fileType.includes("excel") ||
    fileType.includes("presentation") || fileType.includes("powerpoint") ||
    fileType.includes("opendocument") ||
    OFFICE_EXTENSIONS.some(ext => lower.endsWith(ext));
};

type ViewerType = "google" | "microsoft";

const FilePreviewDialog = ({ open, onClose, document: doc, onDownload }: FilePreviewDialogProps) => {
  useAdPrefetch(["landing-top", "verify-top", "verify-bottom"]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [officeViewer, setOfficeViewer] = useState<ViewerType>("google");
  const [officeLoadError, setOfficeLoadError] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeLoadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(1);

  useEffect(() => {
    if (!open || !doc) {
      setPreviewUrl(null);
      setTextContent(null);
      setZoom(1);
      setOfficeViewer("google");
      setOfficeLoadError(false);
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

        if (revoked) return;
        setPreviewUrl(data.signedUrl);

        // Fetch text content for text-based files
        if (isTextFile(doc.name, doc.file_type)) {
          try {
            const resp = await fetch(data.signedUrl);
            const text = await resp.text();
            if (!revoked) setTextContent(text);
          } catch {
            if (!revoked) setTextContent("Failed to load file content.");
          }
        }
      } catch {
        toast.error("Could not preview this file");
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
    return () => { revoked = true; };
  }, [open, doc?.id]);

  // Auto-switch office viewer if iframe fails to load within 8s
  useEffect(() => {
    if (!open || !doc || !previewUrl) return;
    if (!isOfficeFile(doc.name, doc.file_type)) return;

    if (iframeLoadTimer.current) clearTimeout(iframeLoadTimer.current);
    setOfficeLoadError(false);

    iframeLoadTimer.current = setTimeout(() => {
      if (officeViewer === "google") {
        setOfficeViewer("microsoft");
      } else {
        setOfficeLoadError(true);
      }
    }, 10000);

    return () => {
      if (iframeLoadTimer.current) clearTimeout(iframeLoadTimer.current);
    };
  }, [open, doc?.id, previewUrl, officeViewer]);

  const handleIframeLoad = () => {
    if (iframeLoadTimer.current) clearTimeout(iframeLoadTimer.current);
  };

  const retryOfficeViewer = () => {
    setOfficeLoadError(false);
    setOfficeViewer("google");
  };

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (open) resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [open, resetControlsTimer]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setPinchStartDist(getTouchDistance(e.touches));
      setPinchStartZoom(zoom);
    }
    resetControlsTimer();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const scale = getTouchDistance(e.touches) / pinchStartDist;
      setZoom(Math.max(0.5, Math.min(5, pinchStartZoom * scale)));
    }
  };

  const handleTouchEnd = () => setPinchStartDist(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1))));
    }
  };

  if (!open || !doc) return null;

  const isImage = doc.file_type.startsWith("image/");
  const isPdf = doc.file_type.includes("pdf");
  const isVideo = doc.file_type.startsWith("video/");
  const isAudio = doc.file_type.startsWith("audio/");
  const isText = isTextFile(doc.name, doc.file_type);
  const isOffice = isOfficeFile(doc.name, doc.file_type);

  const getOfficeViewerUrl = () => {
    if (!previewUrl) return null;
    if (officeViewer === "google") {
      return `https://docs.google.com/gview?url=${encodeURIComponent(previewUrl)}&embedded=true`;
    }
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`;
  };

  const officeViewerUrl = isOffice ? getOfficeViewerUrl() : null;

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onClick={resetControlsTimer}
    >
      {/* Top controls */}
      <div className={`absolute top-0 left-0 right-0 z-10 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"}`}>
        <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2 safe-area-top">
          <h3 className="text-white text-sm font-medium truncate flex-1 mr-2">{doc.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {(isImage || isPdf) && (
              <>
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-white/70 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(5, z + 0.25))} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button size="sm" onClick={onDownload} className="brass-gradient text-primary-foreground hover:opacity-90 h-8 px-3">
              <Download className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Persistent close */}
      <button
        onClick={onClose}
        className={`absolute top-3 right-3 z-20 h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 hover:text-white transition-all ${showControls ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Content */}
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
                style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: pinchStartDist ? "none" : "transform 0.15s ease" }}
                draggable={false}
              />
            )}

            {isPdf && (
              <iframe src={previewUrl + "#toolbar=1&view=FitH"} className="w-full h-full border-none bg-white" title={doc.name} />
            )}

            {isVideo && (
              <video src={previewUrl} controls className="max-w-full max-h-full" />
            )}

            {isAudio && (
              <div className="flex flex-col items-center gap-4 p-8">
                <Music className="h-16 w-16 text-primary" />
                <p className="text-white text-lg">{doc.name}</p>
                <audio src={previewUrl} controls className="w-full max-w-md" />
              </div>
            )}

            {isOffice && !officeLoadError && officeViewerUrl && (
              <div className="w-full h-full relative">
                <iframe
                  src={officeViewerUrl}
                  className="w-full h-full border-none bg-white"
                  title={doc.name}
                  onLoad={handleIframeLoad}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <div className="bg-black/70 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-2">
                    <span className="text-white/60 text-xs">
                      Viewer: {officeViewer === "google" ? "Google" : "Microsoft"}
                    </span>
                    <button
                      onClick={() => setOfficeViewer(officeViewer === "google" ? "microsoft" : "google")}
                      className="text-xs text-primary underline"
                    >
                      Switch viewer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isOffice && officeLoadError && (
              <div className="flex flex-col items-center gap-4 p-8">
                <FileText className="h-16 w-16 text-white/30" />
                <p className="text-white text-lg">{doc.name}</p>
                <p className="text-sm text-white/60 text-center max-w-sm">
                  Unable to preview this document online. Download it to open with your device's native app.
                </p>
                <div className="flex gap-2">
                  <Button onClick={retryOfficeViewer} variant="outline" className="border-white/20 text-white hover:bg-white/10">
                    <RefreshCw className="h-4 w-4 mr-2" /> Retry
                  </Button>
                  <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                    <Download className="h-4 w-4 mr-2" /> Download
                  </Button>
                </div>
              </div>
            )}

            {isText && (
              <div className="w-full h-full overflow-auto bg-white p-4 sm:p-8">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono max-w-4xl mx-auto">
                  {textContent || "Loading..."}
                </pre>
              </div>
            )}

            {!isImage && !isPdf && !isVideo && !isAudio && !isOffice && !isText && (
              <div className="flex flex-col items-center gap-4 p-8">
                <File className="h-16 w-16 text-white/30" />
                <p className="text-white">{doc.name}</p>
                <p className="text-sm text-white/60">Tap download to open with your device's viewer</p>
                <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                  <Download className="h-4 w-4 mr-2" /> Download to view
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
