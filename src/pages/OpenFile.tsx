import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import FilePreviewDialog from "@/components/FilePreviewDialog";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/downloadFile";
import { showInterstitial } from "@/lib/ads";
import { inferFileType, isAudioFile, isImageFile, isPdfFile, isVideoFile, withInferredType } from "@/lib/fileCompatibility";

const OpenFile = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [officeHtml, setOfficeHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleFile = async () => {
      // Method 1: LaunchQueue API (file_handlers)
      if ("launchQueue" in window) {
        (window as any).launchQueue.setConsumer(async (launchParams: any) => {
          if (launchParams.files?.length > 0) {
            const fileHandle = launchParams.files[0];
            const f = await fileHandle.getFile();
            processFile(f);
          } else {
            setLoading(false);
          }
        });
      }

      // Method 2: Check for shared files via Service Worker message
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "shared-file" && event.data.file) {
            processFile(event.data.file);
          }
        });
      }

      // Fallback: show file picker after a short wait if no file came in
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    };

    handleFile();
  }, []);

  const processFile = async (f: File) => {
    f = withInferredType(f);
    setFile(f);
    setLoading(true);

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);

    const name = f.name.toLowerCase();
    const type = inferFileType(f.name, f.type);

    // Excel
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods") ||
      type.includes("spreadsheet") || type.includes("excel")) {
      try {
        const arrayBuffer = await f.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        let html = "";
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          html += `<h3 style="margin:16px 0 8px;font-weight:600;font-size:16px;">${sheetName}</h3>`;
          html += XLSX.utils.sheet_to_html(sheet, { editable: false });
        });
        setOfficeHtml(html);
      } catch { /* fallback to download */ }
    }

    // Word
    if (name.endsWith(".docx") || name.endsWith(".doc") || name.endsWith(".odt") ||
      type.includes("word") || type.includes("msword")) {
      try {
        const arrayBuffer = await f.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setOfficeHtml(result.value);
      } catch { /* fallback to download */ }
    }

    // Text files
    if (type.startsWith("text/") || type === "application/json" || type === "application/xml" ||
      [".txt", ".csv", ".json", ".xml", ".md", ".log", ".html", ".yaml", ".yml"].some(ext => name.endsWith(ext))) {
      try {
        const text = await f.text();
        setTextContent(text);
      } catch { /* fallback */ }
    }

    setLoading(false);
  };

  const handlePickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files?.[0]) {
        processFile(target.files[0]);
      }
    };
    input.click();
  };

  const handleDownload = async () => {
    if (!file) return;
    try {
      await downloadBlob(file, file.name);
      toast.success("Download started");
      await showInterstitial("save-to-phone", 2 * 60 * 1000);
    } catch (err: any) {
      if (err?.name !== "AbortError") toast.error("Download failed");
    }
  };

  const normalizedType = file ? inferFileType(file.name, file.type) : "";
  const isImage = file ? isImageFile(file.name, normalizedType) : false;
  const isPdf = file ? isPdfFile(file.name, normalizedType) : false;
  const isVideo = file ? isVideoFile(file.name, normalizedType) : false;
  const isAudio = file ? isAudioFile(file.name, normalizedType) : false;
  const hasOfficeHtml = officeHtml !== null;
  const hasText = textContent !== null;

  // If we have a file, show full-screen preview
  if (file && previewUrl) {
    const docObj = {
      id: "local-file",
      name: file.name,
      file_path: "",
      file_size: file.size,
      file_type: normalizedType,
    };
    return (
      <FilePreviewDialog
        open={true}
        onClose={() => navigate("/")}
        document={docObj}
        onDownload={handleDownload}
        localPreviewUrl={previewUrl}
        localOfficeHtml={officeHtml}
        localTextContent={textContent}
      />
    );
  }

  // Landing state: no file yet
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Opening file...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 text-center">
          <FileText className="h-16 w-16 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">DocLocker Viewer</h1>
          <p className="text-muted-foreground max-w-sm">
            Open any document, spreadsheet, image, or media file right here.
          </p>
          <Button onClick={handlePickFile} className="brass-gradient text-primary-foreground">
            Choose a File to Open
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground">
            Back to DocLocker
          </Button>
        </div>
      )}
    </div>
  );
};

export default OpenFile;