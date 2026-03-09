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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { useSubscription } from "@/hooks/useSubscription";

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
  const { canUpload, isFrozen, isRetrievalActive, storageUsed, storageLimit, storagePercent } =
    useSubscription();

  const canAccess = !isFrozen || isRetrievalActive;
  const isNearLimit = storagePercent >= 90;

  const refreshDocs = () =>
    queryClient.invalidateQueries({ queryKey: ["documents", user?.id] });

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
        if (runningTotal + file.size > storageLimit) {
          toast.error(
            `Not enough storage for ${file.name}. Upgrade your plan.`
          );
          continue;
        }

        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file);

        if (uploadError) {
          toast.error(
            `Failed to upload ${file.name}: ${uploadError.message}`
          );
          continue;
        }

        const { error: dbError } = await supabase.from("documents").insert({
          user_id: user.id,
          name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          drawer_name: drawerName,
        });

        if (dbError) {
          toast.error(`Failed to save ${file.name}: ${dbError.message}`);
        } else {
          toast.success(`${file.name} stored safely!`);
          runningTotal += file.size;
        }
      }
      refreshDocs();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (doc: Document) => {
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

  const handleDelete = async (doc: Document) => {
    if (!canAccess) {
      toast.error("Documents are frozen. Please unlock access first.");
      return;
    }

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
      toast.success("Document removed");
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
                : "Store Document"}
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
            Upload documents to store them safely
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
              className={`wood-panel rounded-lg border border-border p-4 flex items-center justify-between gap-4 group transition-colors ${
                canAccess
                  ? "hover:border-brass/30"
                  : "opacity-60"
              }`}
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
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(doc)}
                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-secondary"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-secondary"
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
    </motion.div>
  );
};

export default DrawerView;
