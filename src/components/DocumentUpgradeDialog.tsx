import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
  last_upgraded_at?: string | null;
}

interface DocumentUpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  documents: Document[];
}

type UpgradeStatus = "idle" | "checking" | "upgrading" | "done";

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const needsUpgrade = (doc: Document): boolean => {
  const lastUpgrade = doc.last_upgraded_at ? new Date(doc.last_upgraded_at).getTime() : null;
  const created = new Date(doc.created_at).getTime();
  const reference = lastUpgrade ?? created;
  const age = Date.now() - reference;
  return age > YEAR_MS;
};

const reEncodeImage = (blob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (result) => {
          URL.revokeObjectURL(url);
          if (result) resolve(result);
          else reject(new Error("Re-encode failed"));
        },
        "image/png",
        1
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
};

const DocumentUpgradeDialog = ({ open, onClose, documents }: DocumentUpgradeDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<UpgradeStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [outdatedCount, setOutdatedCount] = useState(0);
  const [upgradedCount, setUpgradedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    if (open) {
      setStatus("idle");
      setProgress(0);
      setCurrent(0);
      setUpgradedCount(0);
      setFailedCount(0);
      const outdated = documents.filter(needsUpgrade).length;
      setOutdatedCount(outdated);
      setTotal(documents.length);
    }
  }, [open, documents]);

  const runCheck = useCallback(() => {
    setStatus("checking");
    const outdated = documents.filter(needsUpgrade).length;
    setOutdatedCount(outdated);

    setTimeout(() => {
      if (outdated === 0) {
        setStatus("done");
      } else {
        setStatus("idle");
      }
    }, 600);
  }, [documents]);

  const runUpgrade = useCallback(async () => {
    if (!user) return;
    setStatus("upgrading");
    setUpgradedCount(0);
    setFailedCount(0);

    const toUpgrade = documents.filter(needsUpgrade);
    const batchSize = 5;
    let upgraded = 0;
    let failed = 0;

    for (let i = 0; i < toUpgrade.length; i += batchSize) {
      const batch = toUpgrade.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (doc) => {
          setCurrentFile(doc.name);
          const isImage = doc.file_type.startsWith("image/");

          if (isImage) {
            const { data, error } = await supabase.storage
              .from("documents")
              .download(doc.file_path);
            if (error) throw error;

            const reEncoded = await reEncodeImage(data);
            const { error: uploadError } = await supabase.storage
              .from("documents")
              .update(doc.file_path, reEncoded, { upsert: true });
            if (uploadError) throw uploadError;
          }

          // Mark as upgraded (for all file types - images get re-encoded, others just get timestamp refreshed)
          const { error: dbError } = await supabase
            .from("documents")
            .update({ last_upgraded_at: new Date().toISOString() } as any)
            .eq("id", doc.id);
          if (dbError) throw dbError;
        })
      );

      results.forEach((r) => {
        if (r.status === "fulfilled") upgraded++;
        else failed++;
      });

      setUpgradedCount(upgraded);
      setFailedCount(failed);
      setCurrent(Math.min(i + batchSize, toUpgrade.length));
      setProgress(((i + batchSize) / toUpgrade.length) * 100);
    }

    setStatus("done");
    setCurrentFile("");
    queryClient.invalidateQueries({ queryKey: ["documents", user.id] });

    if (failed === 0) {
      toast.success(`All ${upgraded} documents upgraded successfully!`);
    } else {
      toast.warning(`Upgraded ${upgraded} files, ${failed} failed.`);
    }
  }, [documents, user, queryClient]);

  const allUpToDate = status === "done" && outdatedCount === 0 && failedCount === 0;
  const hasOutdated = outdatedCount > 0 && status === "idle";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && status !== "upgrading" && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" />
            Document Version Upgrade
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Keep your files compatible with modern devices by upgrading their format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{documents.length}</span> total files in this drawer
            </p>
            {status !== "checking" && (
              <p className="text-sm">
                {outdatedCount > 0 ? (
                  <span className="text-yellow-500 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {outdatedCount} file{outdatedCount !== 1 ? "s" : ""} need{outdatedCount === 1 ? "s" : ""} upgrading
                  </span>
                ) : status === "done" ? (
                  <span className="text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All documents are up to date!
                  </span>
                ) : (
                  <span className="text-muted-foreground">Click "Check Now" to scan your files</span>
                )}
              </p>
            )}
          </div>

          {/* Progress */}
          {(status === "upgrading" || (status === "done" && upgradedCount > 0)) && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {status === "upgrading" ? `Upgrading: ${currentFile}` : "Complete"}
                </span>
                <span>
                  {upgradedCount}/{outdatedCount} done
                  {failedCount > 0 && ` · ${failedCount} failed`}
                </span>
              </div>
            </div>
          )}

          {status === "checking" && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Scanning files…</span>
            </div>
          )}

          {/* Result */}
          {allUpToDate && (
            <div className="text-center py-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Everything is up to date!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your documents are compatible with modern devices.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          {status !== "upgrading" && (
            <Button variant="outline" onClick={onClose} className="border-border text-foreground">
              Close
            </Button>
          )}
          {(status === "idle" || status === "done") && !allUpToDate && (
            <>
              <Button variant="outline" onClick={runCheck} className="border-border text-foreground">
                Check Now
              </Button>
              {hasOutdated && (
                <Button onClick={runUpgrade} className="brass-gradient text-primary-foreground">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Upgrade All
                </Button>
              )}
            </>
          )}
          {status === "upgrading" && (
            <Button disabled className="brass-gradient text-primary-foreground">
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Upgrading…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentUpgradeDialog;
export { needsUpgrade, YEAR_MS };
