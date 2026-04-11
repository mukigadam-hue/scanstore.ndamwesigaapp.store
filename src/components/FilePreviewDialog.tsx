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
  /** For local file opening (not from storage) */
  localPreviewUrl?: string | null;
  localOfficeHtml?: string | null;
  localTextContent?: string | null;
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

const isExcelFile = (name: string, fileType: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".ods") ||
    fileType.includes("spreadsheet") || fileType.includes("excel");
};

const isWordFile = (name: string, fileType: string) => {
  const lower = name.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".doc") || lower.endsWith(".odt") ||
    fileType.includes("word") || fileType.includes("msword") || fileType.includes("opendocument.text");
};

const FilePreviewDialog = ({ open, onClose, document: doc, onDownload, localPreviewUrl, localOfficeHtml, localTextContent }: FilePreviewDialogProps) => {
  useAdPrefetch(["landing-top", "verify-top", "verify-bottom"]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [officeHtml, setOfficeHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(1);

  useEffect(() => {
    if (!open || !doc) {
      setPreviewUrl(null);
      setTextContent(null);
      setOfficeHtml(null);
      setZoom(1);
      return;
    }

    // If local props are provided, use them directly
    if (localPreviewUrl !== undefined) {
      setPreviewUrl(localPreviewUrl);
      if (localOfficeHtml !== undefined) setOfficeHtml(localOfficeHtml);
      if (localTextContent !== undefined) setTextContent(localTextContent);
      setLoading(false);
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

        // Client-side rendering for Office files
        if (isExcelFile(doc.name, doc.file_type)) {
          try {
            const resp = await fetch(data.signedUrl);
            const arrayBuffer = await resp.arrayBuffer();
            const XLSX = await import("xlsx");
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            let html = "";
            workbook.SheetNames.forEach((sheetName) => {
              const sheet = workbook.Sheets[sheetName];
              html += `<h3 style="margin:16px 0 8px;font-weight:600;font-size:16px;">${sheetName}</h3>`;
              html += XLSX.utils.sheet_to_html(sheet, { editable: false });
            });
            if (!revoked) setOfficeHtml(html);
          } catch {
            if (!revoked) setOfficeHtml(null);
          }
        } else if (isWordFile(doc.name, doc.file_type)) {
          try {
            const resp = await fetch(data.signedUrl);
            const arrayBuffer = await resp.arrayBuffer();
            const mammoth = await import("mammoth");
            const result = await mammoth.convertToHtml({ arrayBuffer });
            if (!revoked) setOfficeHtml(result.value);
          } catch {
            if (!revoked) setOfficeHtml(null);
          }
        }

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
  const hasClientRendered = isOffice && officeHtml !== null;

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

            {isOffice && hasClientRendered && (
              <div className="w-full h-full overflow-auto bg-white p-4 sm:p-8">
                <style>{`
                  .office-rendered table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                  .office-rendered th, .office-rendered td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
                  .office-rendered th { background: #f3f4f6; font-weight: 600; }
                  .office-rendered tr:nth-child(even) { background: #f9fafb; }
                  .office-rendered h1, .office-rendered h2, .office-rendered h3 { color: #111; font-weight: 700; margin: 16px 0 8px; }
                  .office-rendered h1 { font-size: 24px; } .office-rendered h2 { font-size: 20px; } .office-rendered h3 { font-size: 17px; }
                  .office-rendered p { margin: 6px 0; }
                  .office-rendered img { max-width: 100%; height: auto; }
                  .office-rendered ul, .office-rendered ol { padding-left: 24px; margin: 8px 0; }
                  .office-rendered li { margin: 4px 0; }
                `}</style>
                <div
                  className="office-rendered max-w-4xl mx-auto"
                  dangerouslySetInnerHTML={{ __html: officeHtml! }}
                  style={{
                    fontSize: "15px",
                    lineHeight: "1.7",
                    color: "#1a1a1a",
                    fontFamily: "'Segoe UI', Arial, sans-serif",
                  }}
                />
              </div>
            )}

            {isOffice && !hasClientRendered && !loading && (
              <div className="flex flex-col items-center gap-4 p-8">
                <FileText className="h-16 w-16 text-white/30" />
                <p className="text-white text-lg">{doc.name}</p>
                <p className="text-sm text-white/60 text-center max-w-sm">
                  This document format couldn't be rendered in-app. Download it to open with your device's native app.
                </p>
                <Button onClick={onDownload} className="brass-gradient text-primary-foreground">
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
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
