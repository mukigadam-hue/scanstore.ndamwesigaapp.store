import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Upload,
  Download,
  Trash2,
  FileText,
  File,
  Image,
  FileSpreadsheet,
  Lock,
  Camera,
  Eye,
  Video,
  Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSubscription } from "@/hooks/useSubscription";
import FilePreviewDialog from "@/components/FilePreviewDialog";
import SecureDeleteDialog from "@/components/SecureDeleteDialog";
import CameraCapture from "@/components/CameraCapture";
import CompressionChoiceDialog from "@/components/CompressionChoiceDialog";
import DownloadQualityDialog from "@/components/DownloadQualityDialog";
import { compressImage, canCompress } from "@/lib/compressImage";

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

interface DrawerViewProps {
  drawerName: string;
  documents: Document[];
  onBack: () => void;
}

const getFileIcon = (type: string) => {
  if (type.startsWith("image/"))
    return <Image className="h-5 w-5 text-primary" />;
  if (type.startsWith("video/"))
    return <Video className="h-5 w-5 text-primary" />;
  if (type.startsWith("audio/"))
    return <Music className="h-5 w-5 text-primary" />;
  if (type.includes("spreadsheet") || type.includes("excel"))
    return <FileSpreadsheet className="h-5 w-5 text-primary" />;
  if (type.includes("pdf"))
    return <FileText className="h-5 w-5 text-destructive" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const DrawerView = ({ drawerName, documents, onBack }: DrawerViewProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { canUpload, isFrozen, isRetrievalActive, storageUsed, storageLimit, storagePercent, currentPlan } =
    useSubscription();

  const canAccess = !isFrozen || isRetrievalActive;
  const isNearLimit = storagePercent >= 90;
  const isFreeUser = currentPlan.id === "free";

  // Preview
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  // Secure delete
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  // Camera
  const [showCamera, setShowCamera] = useState(false);
  // Compression choice (premium only)
  const [compressionFile, setCompressionFile] = useState<{ file: File; resolve: (compress: boolean) => void } | null>(null);
  // Download quality
  const [downloadDoc, setDownloadDoc] = useState<Document | null>(null);

  const refreshDocs = () =>
    queryClient.invalidateQueries({ queryKey: ["documents", user?.id] });

  const compressFile = async (file: File): Promise<{ blob: Blob; size: number }> => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await supabase.functions.invoke("compress-document", {
        body: formData,
      });

      if (!error && data) {
        const compressedBlob = new Blob([data]);
        if (compressedBlob.size < file.size) {
          const savings = ((1 - compressedBlob.size / file.size) * 100).toFixed(0);
          toast.success(`${file.name} compressed by ${savings}%`);
          return { blob: compressedBlob, size: compressedBlob.size };
        }
      }
    } catch (e) {
      console.warn("Compression failed, using original:", e);
    }
    return { blob: file, size: file.size };
  };

  const askPremiumCompression = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      setCompressionFile({ file, resolve });
    });
  };

  const uploadSingleFile = async (file: File, runningTotal: number): Promise<number> => {
    let fileToUpload: File | Blob = file;
    let finalSize = file.size;

    if (isFreeUser) {
      // Always compress for free users
      const result = await compressFile(file);
      fileToUpload = result.blob;
      finalSize = result.size;
    } else {
      // Premium users get a choice
      const shouldCompress = await askPremiumCompression(file);
      if (shouldCompress) {
        const result = await compressFile(file);
        fileToUpload = result.blob;
        finalSize = result.size;
      }
    }

    if (runningTotal + finalSize > storageLimit) {
      toast.error(`Not enough storage for ${file.name}. Upgrade your plan.`);
      return 0;
    }

    const filePath = `${user!.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, fileToUpload);

    if (uploadError) {
      toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
      return 0;
    }

    const { error: dbError } = await supabase.from("documents").insert({
      user_id: user!.id,
      name: file.name,
      file_path: filePath,
      file_size: finalSize,
      file_type: file.type,
      drawer_name: drawerName,
    });

    if (dbError) {
      toast.error(`Failed to save ${file.name}: ${dbError.message}`);
      return 0;
    }

    toast.success(`${file.name} stored safely!`);
    return finalSize;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    if (!canUpload) {
      toast.error(
        isFrozen
          ? "Your vault is frozen. Please unlock access first."
          : "Storage limit reached. Please upgrade your plan."
      );
      return;
    }

    setUploading(true);
    let runningTotal = storageUsed;

    try {
      for (const file of Array.from(files)) {
        const added = await uploadSingleFile(file, runningTotal);
        runningTotal += added;
      }
      refreshDocs();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCameraCapture = async (file: File) => {
    if (!user || !canUpload) return;
    setUploading(true);
    try {
      await uploadSingleFile(file, storageUsed);
      refreshDocs();
    } finally {
      setUploading(false);
    }
  };

  const performDownload = async (doc: Document) => {
    if (!canAccess) {
      toast.error("Documents are frozen. Please unlock access first.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("documents")
      .download(doc.file_path);

    if (error) {
      toast.error("Failed to download: " + error.message);
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded " + doc.name);
  };

  const handleDownloadClick = (doc: Document) => {
    if (!canAccess) {
      toast.error("Documents are frozen. Please unlock access first.");
      return;
    }
    // Show quality choice dialog
    setDownloadDoc(doc);
  };

  const handleDownloadChoice = async (highQuality: boolean) => {
    if (!downloadDoc) return;
    setDownloadDoc(null);
    // For now both download the stored file - high quality is the stored version
    await performDownload(downloadDoc);
    if (highQuality) {
      toast.info("Downloaded in highest available quality");
    }
  };

  const handleDeleteClick = (doc: Document) => {
    if (!canAccess) {
      toast.error("Documents are frozen. Please unlock access first.");
      return;
    }
    setDeleteDoc(doc);
  };

  const performDelete = async () => {
    if (!deleteDoc) return;
    const doc = deleteDoc;

    queryClient.setQueryData(
      ["documents", user?.id],
      (old: Document[] = []) => old.filter((d) => d.id !== doc.id)
    );

    const { error: storageError } = await supabase.storage
      .from("documents")
      .remove([doc.file_path]);

    if (storageError) {
      toast.error("Failed to delete file: " + storageError.message);
      refreshDocs();
      return;
    }

    const { error: dbError } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id);

    if (dbError) {
      toast.error("Failed to delete record: " + dbError.message);
      refreshDocs();
    } else {
      toast.success("Document permanently removed");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-foreground hover:text-primary hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="font-display text-2xl font-bold brass-text">
            {drawerName}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {isNearLimit && canAccess && (
            <span className="text-xs text-yellow-500 hidden sm:inline">
              Storage {Math.round(storagePercent)}% full
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCamera(true)}
            disabled={!canUpload}
            className="text-muted-foreground hover:text-primary hover:bg-secondary"
            title="Camera & Scanner"
          >
            <Camera className="h-5 w-5" />
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !canUpload}
            className="brass-gradient text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading
              ? "Uploading..."
              : !canUpload
                ? isFrozen
                  ? "Frozen"
                  : "Full"
                : "Store"}
          </Button>
        </div>
      </div>

      {/* Document list */}
      {documents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-display text-lg">
            This drawer is empty
          </p>
          <p className="text-muted-foreground/60 text-sm mt-1">
            Upload documents or use the camera to store them safely
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: i * 0.04 }}
              className={`wood-panel rounded-lg border border-border p-4 flex items-center justify-between gap-4 group transition-colors cursor-pointer ${
                canAccess ? "hover:border-brass/30" : "opacity-60"
              }`}
              onClick={() => canAccess && setPreviewDoc(doc)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {getFileIcon(doc.file_type)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {doc.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(doc.file_size)} ·{" "}
                    {format(new Date(doc.created_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              {canAccess ? (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreviewDoc(doc)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-secondary"
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownloadClick(doc)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-secondary"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(doc)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-secondary"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Lock className="h-4 w-4 text-destructive/50 shrink-0" />
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <FilePreviewDialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
        onDownload={() => previewDoc && performDownload(previewDoc)}
      />

      <SecureDeleteDialog
        open={!!deleteDoc}
        onClose={() => setDeleteDoc(null)}
        documentName={deleteDoc?.name || ""}
        onConfirmDelete={performDelete}
      />

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />

      {compressionFile && (
        <CompressionChoiceDialog
          open={true}
          fileName={compressionFile.file.name}
          onChoice={(compress) => {
            compressionFile.resolve(compress);
            setCompressionFile(null);
          }}
          onClose={() => {
            compressionFile.resolve(false);
            setCompressionFile(null);
          }}
        />
      )}

      <DownloadQualityDialog
        open={!!downloadDoc}
        fileName={downloadDoc?.name || ""}
        onChoice={handleDownloadChoice}
        onClose={() => setDownloadDoc(null)}
      />
    </motion.div>
  );
};

export default DrawerView;
