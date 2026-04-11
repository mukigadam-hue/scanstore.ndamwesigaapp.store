import { useState, useEffect, useRef, useCallback } from "react";
import { useAdPrefetch } from "@/hooks/useAdPrefetch";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, Music, Video, File, ZoomIn, ZoomOut, Pencil, Save, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

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
  localPreviewUrl?: string | null;
  localOfficeHtml?: string | null;
  localTextContent?: string | null;
}

const TEXT_EXTENSIONS = [".txt", ".csv", ".json", ".xml", ".md", ".rtf", ".log", ".html", ".htm", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env", ".sh", ".bat", ".ps1", ".py", ".js", ".ts", ".jsx", ".tsx", ".css", ".scss", ".sql", ".r", ".rb", ".php", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".swift", ".kt"];
const OFFICE_EXTENSIONS = [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"];

const isTextFile = (name: string, fileType: string) => {
  const lower = name.toLowerCase();
  return fileType.startsWith("text/") || fileType === "application/json" || fileType === "application/xml" ||
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

const canEdit = (name: string, fileType: string) => {
  return isTextFile(name, fileType) || isWordFile(name, fileType) || isExcelFile(name, fileType);
};

const FilePreviewDialog = ({ open, onClose, document: doc, onDownload, localPreviewUrl, localOfficeHtml, localTextContent }: FilePreviewDialogProps) => {
  useAdPrefetch(["landing-top", "verify-top", "verify-bottom"]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [officeHtml, setOfficeHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartZoom, setPinchStartZoom] = useState(1);

  // Store original arrayBuffer for Excel re-save
  const excelBufferRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!open || !doc) {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setTextContent(null);
      setOfficeHtml(null);
      setZoom(1);
      setEditing(false);
      setEditedText("");
      setHasChanges(false);
      excelBufferRef.current = null;
      return;
    }

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

        // For PDFs and images, fetch as blob to avoid Chrome blocking cross-origin iframes
        const isPdfFile = doc.file_type.includes("pdf");
        const isImageFile = doc.file_type.startsWith("image/");
        const isVideoFile = doc.file_type.startsWith("video/");
        const isAudioFile = doc.file_type.startsWith("audio/");

        if (isPdfFile || isImageFile || isVideoFile || isAudioFile) {
          try {
            const resp = await fetch(data.signedUrl);
            const blob = await resp.blob();
            if (revoked) return;
            const blobUrl = URL.createObjectURL(blob);
            setPreviewUrl(blobUrl);
          } catch {
            // Fallback to signed URL
            if (!revoked) setPreviewUrl(data.signedUrl);
          }
        } else {
          setPreviewUrl(data.signedUrl);
        }

        if (isExcelFile(doc.name, doc.file_type)) {
          try {
            const resp = await fetch(data.signedUrl);
            const arrayBuffer = await resp.arrayBuffer();
            excelBufferRef.current = arrayBuffer.slice(0);
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

        if (isTextFile(doc.name, doc.file_type)) {
          try {
            const resp = await fetch(data.signedUrl);
            const text = await resp.text();
            if (!revoked) {
              setTextContent(text);
              setEditedText(text);
            }
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
    controlsTimer.current = setTimeout(() => setShowControls(false), 5000);
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

  // === SAVE LOGIC ===
  const handleSaveText = async () => {
    if (!doc || !doc.file_path || localPreviewUrl !== undefined) return;
    setSaving(true);
    try {
      const blob = new Blob([editedText], { type: doc.file_type || "text/plain" });
      const { error } = await supabase.storage
        .from("documents")
        .update(doc.file_path, blob, { upsert: true });
      if (error) throw error;

      setTextContent(editedText);
      setHasChanges(false);
      setEditing(false);
      toast.success("File saved successfully!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOfficeDoc = async () => {
    if (!doc || !doc.file_path || localPreviewUrl !== undefined) return;
    if (!editorRef.current) return;

    setSaving(true);
    try {
      const editedHtml = editorRef.current.innerHTML;

      if (isWordFile(doc.name, doc.file_type)) {
        // Convert HTML back to a simple .docx
        const { Document, Packer, Paragraph, TextRun } = await import("docx");

        // Parse HTML content into paragraphs
        const tempDiv = window.document.createElement("div");
        tempDiv.innerHTML = editedHtml;
        const children: any[] = [];

        const processNode = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) {
              children.push(new Paragraph({ children: [new TextRun(text)] }));
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();

            if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
              children.push(new Paragraph({
                children: [new TextRun({ text: el.textContent || "", bold: true, size: tag === "h1" ? 32 : tag === "h2" ? 28 : 24 })],
              }));
            } else if (tag === "p" || tag === "div") {
              const runs: any[] = [];
              el.childNodes.forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                  if (child.textContent) runs.push(new TextRun(child.textContent));
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                  const childEl = child as HTMLElement;
                  const isBold = childEl.tagName === "STRONG" || childEl.tagName === "B";
                  const isItalic = childEl.tagName === "EM" || childEl.tagName === "I";
                  runs.push(new TextRun({
                    text: childEl.textContent || "",
                    bold: isBold,
                    italics: isItalic,
                  }));
                }
              });
              if (runs.length > 0) {
                children.push(new Paragraph({ children: runs }));
              }
            } else if (tag === "ul" || tag === "ol") {
              el.querySelectorAll("li").forEach((li) => {
                children.push(new Paragraph({
                  children: [new TextRun("• " + (li.textContent || ""))],
                  indent: { left: 720 },
                }));
              });
            } else if (tag === "table") {
              // Skip tables in Word save — too complex for simple conversion
              el.querySelectorAll("tr").forEach((tr) => {
                const cells = Array.from(tr.querySelectorAll("td, th")).map(c => c.textContent || "").join(" | ");
                if (cells) children.push(new Paragraph({ children: [new TextRun(cells)] }));
              });
            } else {
              // Recurse into unknown elements
              el.childNodes.forEach(processNode);
            }
          }
        };

        tempDiv.childNodes.forEach(processNode);

        if (children.length === 0) {
          children.push(new Paragraph({ children: [new TextRun("")] }));
        }

        const docFile = new Document({
          sections: [{ children }],
        });

        const bufferResult = await Packer.toBuffer(docFile);
        const uint8 = new Uint8Array(bufferResult);
        const blob = new Blob([uint8], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

        const { error } = await supabase.storage
          .from("documents")
          .update(doc.file_path, blob, { upsert: true });
        if (error) throw error;
      } else if (isExcelFile(doc.name, doc.file_type)) {
        // Parse edited HTML table back to XLSX
        const XLSX = await import("xlsx");
        const tables = editorRef.current.querySelectorAll("table");
        const wb = XLSX.utils.book_new();

        if (tables.length > 0) {
          tables.forEach((table, idx) => {
            // Find the sheet name from the preceding h3
            let sheetName = `Sheet${idx + 1}`;
            const prev = table.previousElementSibling;
            if (prev && prev.tagName === "H3") {
              sheetName = prev.textContent || sheetName;
            }
            const ws = XLSX.utils.table_to_sheet(table);
            XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
          });
        } else {
          // Fallback: plain text
          const ws = XLSX.utils.aoa_to_sheet([[editorRef.current.textContent || ""]]);
          XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        }

        const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

        const { error } = await supabase.storage
          .from("documents")
          .update(doc.file_path, blob, { upsert: true });
        if (error) throw error;
      }

      setHasChanges(false);
      setEditing(false);
      toast.success("Document saved successfully!");
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEdit = () => {
    if (editing && hasChanges) {
      // Switching back to view mode with unsaved changes
      const confirm = window.confirm("You have unsaved changes. Discard them?");
      if (!confirm) return;
    }
    setEditing(!editing);
    setHasChanges(false);
    if (!editing && textContent) {
      setEditedText(textContent);
    }
    resetControlsTimer();
  };

  const handleSave = () => {
    if (!doc) return;
    if (isTextFile(doc.name, doc.file_type)) {
      handleSaveText();
    } else {
      handleSaveOfficeDoc();
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
  const isEditable = canEdit(doc.name, doc.file_type) && localPreviewUrl === undefined;
  const isLocalFile = localPreviewUrl !== undefined;

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onClick={resetControlsTimer}
    >
      {/* Top controls */}
      <div className={`absolute top-0 left-0 right-0 z-10 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"}`}>
        <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2 safe-area-top">
          <h3 className="text-white text-sm font-medium truncate flex-1 mr-2">
            {doc.name}
            {editing && <span className="text-primary text-xs ml-2">Editing</span>}
          </h3>
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

            {/* Edit / Save buttons */}
            {isEditable && !editing && (
              <Button size="sm" onClick={handleToggleEdit} variant="ghost" className="h-8 px-2 text-white/80 hover:text-white hover:bg-white/10">
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            {isEditable && editing && (
              <>
                <Button size="sm" onClick={handleToggleEdit} variant="ghost" className="h-8 px-2 text-white/80 hover:text-white hover:bg-white/10">
                  <Eye className="h-4 w-4 mr-1" /> View
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <><Save className="h-4 w-4 mr-1" /> Save</>
                  )}
                </Button>
              </>
            )}

            <Button size="sm" onClick={onDownload} className="brass-gradient text-primary-foreground hover:opacity-90 h-8 px-3">
              <Download className="h-4 w-4 mr-1" /> {isLocalFile ? "Save" : "Download"}
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
              <PdfCanvasViewer url={previewUrl} zoom={zoom} />
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
                  .office-rendered[contenteditable="true"] { outline: none; cursor: text; min-height: 200px; }
                  .office-rendered[contenteditable="true"]:focus { box-shadow: inset 0 0 0 2px #b8860b40; border-radius: 4px; }
                  .office-rendered[contenteditable="true"] td,
                  .office-rendered[contenteditable="true"] th { cursor: text; }
                `}</style>
                {editing && (
                  <div className="max-w-4xl mx-auto mb-3 flex items-center gap-2 px-1">
                    <div className="flex-1 h-px bg-amber-300/30" />
                    <span className="text-xs text-amber-700 font-medium px-2 py-1 bg-amber-50 rounded-full border border-amber-200">
                      ✏️ Editing Mode — tap on text to edit, then Save
                    </span>
                    <div className="flex-1 h-px bg-amber-300/30" />
                  </div>
                )}
                <div
                  ref={editorRef}
                  className="office-rendered max-w-4xl mx-auto"
                  contentEditable={editing}
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: officeHtml! }}
                  onInput={() => setHasChanges(true)}
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

            {isText && !editing && (
              <div className="w-full h-full overflow-auto bg-white p-4 sm:p-8">
                <pre className="text-sm whitespace-pre-wrap font-mono max-w-4xl mx-auto" style={{ color: "#1a1a1a" }}>
                  {textContent || "Loading..."}
                </pre>
              </div>
            )}

            {isText && editing && (
              <div className="w-full h-full overflow-auto bg-white p-4 sm:p-8 flex flex-col">
                <div className="max-w-4xl mx-auto w-full mb-3 flex items-center gap-2">
                  <div className="flex-1 h-px bg-amber-300/30" />
                  <span className="text-xs text-amber-700 font-medium px-2 py-1 bg-amber-50 rounded-full border border-amber-200">
                    ✏️ Editing Mode
                  </span>
                  <div className="flex-1 h-px bg-amber-300/30" />
                </div>
                <textarea
                  className="flex-1 w-full max-w-4xl mx-auto font-mono text-sm border border-gray-300 rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  style={{ color: "#1a1a1a", backgroundColor: "#fffef7", minHeight: "300px" }}
                  value={editedText}
                  onChange={(e) => {
                    setEditedText(e.target.value);
                    setHasChanges(true);
                  }}
                  spellCheck={false}
                />
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