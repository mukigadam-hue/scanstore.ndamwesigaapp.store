import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, X, Save, Download, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showInterstitial } from "@/lib/ads";
import SaveToVaultButton from "@/components/SaveToVaultButton";
import PdfCanvasViewer from "@/components/PdfCanvasViewer";
import { downloadBlob } from "@/lib/downloadFile";
import { inferFileType, isImageFile, isPdfFile, withInferredType } from "@/lib/fileCompatibility";

function dataUrlToFile(dataUrl: string, name: string, type: string): File {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: inferFileType(name, type) });
}

export default function ViewerScreen() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [officeHtml, setOfficeHtml] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const handleFile = async (f: File) => {
      f = withInferredType(f);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      const name = f.name.toLowerCase();
      const type = f.type;
      if (
        name.endsWith(".docx") ||
        name.endsWith(".doc") ||
        type.includes("word") ||
        type.includes("msword")
      ) {
        try {
          const ab = await f.arrayBuffer();
          const mammoth = await import("mammoth");
          const r = await mammoth.convertToHtml({ arrayBuffer: ab });
          setOfficeHtml(r.value);
        } catch {
          /* ignore */
        }
      } else if (
        type.startsWith("text/") ||
        [".txt", ".md", ".csv", ".json", ".log"].some((e) => name.endsWith(e))
      ) {
        try {
          setTextContent(await f.text());
        } catch {
          /* ignore */
        }
      }
    };

    // Pending from /scan or PWA launch
    const pending = sessionStorage.getItem("viewerPendingFile");
    if (pending) {
      try {
        const { name, type, dataUrl } = JSON.parse(pending);
        sessionStorage.removeItem("viewerPendingFile");
        handleFile(dataUrlToFile(dataUrl, name, type));
        return;
      } catch {
        /* fall through */
      }
    }

    // PWA file_handlers LaunchQueue
    if ("launchQueue" in window) {
      (window as any).launchQueue.setConsumer(async (params: any) => {
        const fh = params.files?.[0];
        if (fh) handleFile(await fh.getFile());
      });
    }
  }, []);

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e) => {
      const t = e.target as HTMLInputElement;
      const f = t.files?.[0];
      if (!f) return;
      // No ad on switching files — ads only fire at explicit save/verify actions.
      // Reset state then load new
      setFile(null);
      setPreviewUrl(null);
      setOfficeHtml(null);
      setTextContent(null);
      setEditMode(false);
      const reader = new FileReader();
      reader.onload = () => {
        sessionStorage.setItem(
          "viewerPendingFile",
          JSON.stringify({ name: f.name, type: f.type, dataUrl: reader.result })
        );
        // Re-mount by toggling a key via location.reload trick avoided: just re-fire effect by setting state.
        // Easier: directly handle here:
        const newFile = dataUrlToFile(reader.result as string, f.name, f.type);
        sessionStorage.removeItem("viewerPendingFile");
        setFile(newFile);
        setPreviewUrl(URL.createObjectURL(newFile));
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const handleClose = async () => {
    // No ad on close — back navigation must never trigger interstitials.
    navigate("/");
  };

  const handleSaveChanges = async () => {
    if (!file) return;
    let blob: Blob;
    let newName = file.name;
    if (textContent !== null) {
      blob = new Blob([textContent], { type: "text/plain" });
    } else if (officeHtml !== null) {
      blob = new Blob(
        [`<!doctype html><meta charset="utf-8"><body>${officeHtml}</body>`],
        { type: "text/html" }
      );
      newName = file.name.replace(/\.(docx?|odt)$/i, "") + ".html";
    } else {
      toast.error("Nothing editable to save");
      return;
    }
    const newFile = new File([blob], newName, { type: blob.type });
    setFile(newFile);
    setPreviewUrl(URL.createObjectURL(newFile));
    toast.success("Changes saved to the working copy");
    // No ad on save-changes — ads only fire at explicit save-to-phone / last-verify.
  };

  const handleDownload = async () => {
    if (!file) return;
    try {
      await downloadBlob(file, file.name);
      toast.success("Download started");
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error("Download failed");
    }
  };

  if (!file) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <FileText className="h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold brass-text font-display">Document Viewer</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            Pick a file from your device, or open one through your phone's "Open With" menu.
          </p>
          <div className="flex gap-2">
            <Button onClick={pickFile} className="brass-gradient text-primary-foreground">
              <FolderOpen className="h-4 w-4 mr-2" /> Choose File
            </Button>
            <Button variant="ghost" onClick={() => navigate("/")}>Back</Button>
          </div>
        </div>
      </div>
    );
  }

  const isEditable = textContent !== null || officeHtml !== null;
  const normalizedType = inferFileType(file.name, file.type);
  const isImage = isImageFile(file.name, normalizedType);
  const isPdf = isPdfFile(file.name, normalizedType);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Action bar */}
      <header className="wood-panel border-b border-border sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate text-sm font-medium">{file.name}</span>
          </div>
          {isEditable && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditMode((v) => !v)}>
                {editMode ? "View" : "Edit"}
              </Button>
              {editMode && (
                <Button size="sm" onClick={handleSaveChanges} className="brass-gradient text-primary-foreground">
                  <Save className="h-4 w-4 mr-1" /> Save Changes
                </Button>
              )}
            </>
          )}
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
          <Button size="sm" variant="outline" onClick={pickFile}>
            <FolderOpen className="h-4 w-4 mr-1" /> Open Another
          </Button>
          <SaveToVaultButton file={file} className="brass-gradient text-primary-foreground" />
          <Button size="sm" variant="ghost" onClick={handleClose} title="Close Document">
            <X className="h-4 w-4 mr-1" /> Close Document
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-3">
        {textContent !== null && (
          editMode ? (
            <textarea
              className="w-full h-[70vh] rounded-md border border-border bg-background p-3 font-mono text-sm"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm p-3 rounded-md border border-border bg-card">{textContent}</pre>
          )
        )}
        {officeHtml !== null && (
          <div
            className="prose prose-sm max-w-none p-4 rounded-md border border-border bg-card min-h-[70vh]"
            contentEditable={editMode}
            suppressContentEditableWarning
            onInput={(e) => setOfficeHtml((e.target as HTMLDivElement).innerHTML)}
            dangerouslySetInnerHTML={{ __html: officeHtml }}
          />
        )}
        {textContent === null && officeHtml === null && isImage && previewUrl && (
          <img src={previewUrl} alt={file.name} className="max-w-full mx-auto rounded-md" />
        )}
        {textContent === null && officeHtml === null && isPdf && previewUrl && (
          <PdfCanvasViewer url={previewUrl} />
        )}
        {textContent === null && officeHtml === null && !isImage && !isPdf && (
          <div className="text-center text-muted-foreground py-12">
            Preview not available — use Download or Save to Vault.
          </div>
        )}
      </main>
    </div>
  );
}
