import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Sparkles, FileCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DownloadQualityDialogProps {
  open: boolean;
  fileName: string;
  onChoice: (highQuality: boolean) => void;
  onClose: () => void;
}

const DownloadQualityDialog = ({ open, fileName, onChoice, onClose }: DownloadQualityDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display brass-text flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t("scan.downloadQuality")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("scan.chooseDownloadQuality")} <span className="text-foreground font-medium truncate block">{fileName}</span>
          </p>

          <div className="space-y-2">
            <button
              onClick={() => onChoice(false)}
              className="w-full wood-panel rounded-lg border border-border p-4 text-left hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="brass-gradient rounded-lg p-2">
                  <FileCheck className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("scan.savedQuality")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("scan.downloadExactlyStored")}
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => onChoice(true)}
              className="w-full wood-panel rounded-lg border border-border p-4 text-left hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="brass-gradient rounded-lg p-2">
                  <Sparkles className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("scan.highQuality")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("scan.enhancedSharpness")}
                  </p>
                </div>
              </div>
            </button>
          </div>

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            {t("scan.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DownloadQualityDialog;
