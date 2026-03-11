import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, FileText, Music, Video, File } from "lucide-react";
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

  useEffect(() => {
    if (!open || !doc) {
      setPreviewUrl(null);
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

  if (!doc) return null;

  const isImage = doc.file_type.startsWith("image/");
  const isPdf = doc.file_type.includes("pdf");
  const isVideo = doc.file_type.startsWith("video/");
  const isAudio = doc.file_type.startsWith("audio/");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] bg-card border-border overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display brass-text text-lg truncate pr-4">
              {doc.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={onDownload}
                className="brass-gradient text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : previewUrl ? (
            <div className="flex items-center justify-center">
              {isImage && (
                <img
                  src={previewUrl}
                  alt={doc.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              )}
              {isPdf && (
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh] rounded-lg border border-border"
                  title={doc.name}
                />
              )}
              {isVideo && (
                <video
                  src={previewUrl}
                  controls
                  className="max-w-full max-h-[70vh] rounded-lg"
                />
              )}
              {isAudio && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Music className="h-16 w-16 text-primary" />
                  <p className="text-foreground font-display text-lg">{doc.name}</p>
                  <audio src={previewUrl} controls className="w-full max-w-md" />
                </div>
              )}
              {!isImage && !isPdf && !isVideo && !isAudio && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <File className="h-16 w-16 text-muted-foreground" />
                  <p className="text-foreground font-display">{doc.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Preview not available for this file type
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
