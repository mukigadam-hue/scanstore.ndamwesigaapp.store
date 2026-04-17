import { useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Upload, Download, Trash2, FileText, File,
  Image, FileSpreadsheet, Lock, Camera, Eye, Video, Music, RefreshCw,
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
import { enhanceImageBlob } from "@/lib/enhanceImage";
import DocumentUpgradeDialog, { needsUpgrade } from "@/components/DocumentUpgradeDialog";

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
  last_upgraded_at?: string | null;
}

interface DrawerViewProps {
  drawerName: string;
  documents: Document[];
  onBack: () => void;
  onScanStart?: () => void;
  onScanEnd?: () => void;
}

const getFileIcon = (type: string) => {
  if (type.startsWith("image/")) return <Image className="h-5 w-5 text-primary" />;
  if (type.startsWith("video/")) return <Video className="h-5 w-5 text-primary" />;
  if (type.startsWith("audio/")) return <Music className="h-5 w-5 text-primary" />;
  if (type.includes("spreadsheet") || type.includes("excel")) return <FileSpreadsheet className="h-5 w-5 text-primary" />;
  if (type.includes("pdf")) return <FileText className="h-5 w-5 text-destructive" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const DrawerView = ({ drawerName, documents, onBack, onScanStart, onScanEnd }: DrawerViewProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraUploadInFlightRef = useRef(false);
  const { canUpload, isFrozen, isRetrievalActive, storageUsed, storageLimit, storagePercent, currentPlan } =
    useSubscription();

  const canAccess = !isFrozen || isRetrievalActive;
  const isNearLimit = storagePercent >= 90;
  const isFreeUser = currentPlan.id === "free";

  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [compressionFile, setCompressionFile] = useState<{ file: File; resolve: (compress: boolean) => void } | null>(null);
  const [downloadDoc, setDownloadDoc] = useState<Document | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const outdatedCount = useMemo(() => documents.filter(needsUpgrade).length, [documents]);

  const refreshDocs = () =>
    queryClient.invalidateQueries({ queryKey: ["documents", user?.id] });

  const compressFile = async (file: File): Promise<{ file: File; size: number }> => {
    if (!canCompress(file)) {
      return { file, size: file.size };
    }
    try {
      const compressed = await compressImage(file);
      if (compressed.size < file.size) {
        const savings = ((1 - compressed.size / file.size) * 100).toFixed(0);
        toast.success(`${file.name} compressed by ${savings}%`);
        return { file: compressed, size: compressed.size };
      }
    } catch (e) {
      console.warn("Compression failed, using original:", e);
    }
    return { file, size: file.size };
  };

  const askPremiumCompression = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      setCompressionFile({ file, resolve });
    });
  };

  const uploadSingleFile = async (file: File, runningTotal: number): Promise<number> => {
    let fileToUpload: File | Blob = file;
    let finalSize = file.size;

    // Skip compression for PDFs (including scanned documents) — they're already optimized
    const isPdf = file.type === "application/pdf";

    if (!isPdf) {
      if (isFreeUser) {
        const result = await compressFile(file);
        fileToUpload = result.file;
        finalSize = result.size;
      } else if (canCompress(file)) {
        const shouldCompress = await askPremiumCompression(file);
        if (shouldCompress) {
          const result = await compressFile(file);
          fileToUpload = result.file;
          finalSize = result.size;
        }
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
    if (!user || !canUpload) {
      cameraUploadInFlightRef.current = false;
      onScanEnd?.();
      return;
    }

    setUploading(true);
    try {
      await uploadSingleFile(file, storageUsed);
      refreshDocs();
    } finally {
      cameraUploadInFlightRef.current = false;
      setUploading(false);
      onScanEnd?.();
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
    setDownloadDoc(doc);
  };

  const handleDownloadChoice = async (highQuality: boolean) => {
    if (!downloadDoc) return;
    const doc = downloadDoc;
    setDownloadDoc(null);

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

    let blobToDownload: Blob = data;

    if (highQuality && data.type.startsWith("image/")) {
      toast.info("Enhancing image quality…");
      try {
        blobToDownload = await enhanceImageBlob(data);
        toast.success("Enhanced quality download ready");
      } catch {
        toast.info("Could not enhance — downloading original");
      }
    }

    const url = URL.createObjectURL(blobToDownload);
    const a = document.createElement("a");
    a.href = url;
    let downloadName: string;
    if (highQuality && data.type.startsWith("image/")) {
      downloadName = doc.name.replace(/(\.\w+)$/, "_high_quality.png");
    } else if (!highQuality) {
      downloadName = doc.name.replace(/(\.\w+)$/, "_saved_quality$1");
    } else {
      downloadName = doc.name;
    }
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded " + downloadName);
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
            onClick={() => setShowUpgrade(true)}
            className={`hover:text-primary hover:bg-secondary ${
              outdatedCount > 0 ? "text-destructive animate-pulse" : "text-muted-foreground"
            }`}
            title={outdatedCount > 0 ? `${outdatedCount} files need upgrading` : "Check file versions"}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
          {/* Camera & upload buttons follow */}
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

      {/* Upgrade reminder banner */}
      {outdatedCount > 0 && documents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-foreground">
              <span className="font-semibold">{outdatedCount}</span> file{outdatedCount !== 1 ? "s" : ""} may need a format upgrade for future device compatibility.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowUpgrade(true)}
            className="brass-gradient text-primary-foreground text-xs shrink-0"
          >
            Upgrade
          </Button>
        </motion.div>
      )}

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
          {documents.map((doc, i) => {
            const isCleanable = doc.file_type.startsWith("image/") || doc.file_type.includes("pdf");
            const isSelected = selectedForClean.has(doc.id);
            return (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: i * 0.04 }}
              className={`wood-panel rounded-lg border p-4 flex items-center justify-between gap-4 group transition-colors cursor-pointer ${
                cleanMode && isSelected ? "border-primary/50 bg-primary/5" :
                canAccess ? "border-border hover:border-brass/30" : "border-border opacity-60"
              }`}
              onClick={() => {
                if (cleanMode) {
                  if (isCleanable) toggleCleanSelect(doc.id);
                } else {
                  canAccess && setPreviewDoc(doc);
                }
              }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {cleanMode && isCleanable && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleCleanSelect(doc.id)}
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {cleanMode && !isCleanable && (
                  <div className="h-4 w-4 shrink-0" />
                )}
                {getFileIcon(doc.file_type)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {doc.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(doc.file_size)} ·{" "}
                    {format(new Date(doc.created_at), "MMM d, yyyy")}
                    {cleanMode && !isCleanable && (
                      <span className="text-muted-foreground/50 ml-1">· Not cleanable</span>
                    )}
                  </p>
                </div>
              </div>

              {!cleanMode && canAccess ? (
                <div className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewDoc(doc)}
                    className="h-8 px-2 sm:px-3 text-xs border-border text-foreground hover:text-primary hover:border-primary/40 hover:bg-secondary"
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">View</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadClick(doc)}
                    className="h-8 px-2 sm:px-3 text-xs border-border text-foreground hover:text-primary hover:border-primary/40 hover:bg-secondary"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Save</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteClick(doc)}
                    className="h-8 px-2 sm:px-3 text-xs border-destructive/40 text-destructive hover:text-destructive-foreground hover:bg-destructive/90"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              ) : !cleanMode ? (
                <Lock className="h-4 w-4 text-destructive/50 shrink-0" />
              ) : null}
            </motion.div>
            );
          })}
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
        onClose={() => {
          setShowCamera(false);
          if (!cameraUploadInFlightRef.current) {
            onScanEnd?.();
          }
        }}
        onCapture={(file) => {
          cameraUploadInFlightRef.current = true;
          void handleCameraCapture(file);
        }}
        onScanStart={onScanStart}
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

      <DocumentUpgradeDialog
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        documents={documents}
      />
    </motion.div>
  );
};

export default DrawerView;
