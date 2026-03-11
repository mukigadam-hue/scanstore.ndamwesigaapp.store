import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minimize2, Maximize2, FileText } from "lucide-react";

interface CompressionChoiceDialogProps {
  open: boolean;
  fileName: string;
  onChoice: (compress: boolean) => void;
  onClose: () => void;
}

const CompressionChoiceDialog = ({ open, fileName, onChoice, onClose }: CompressionChoiceDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display brass-text flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Options
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            How would you like to store <span className="text-foreground font-medium">{fileName}</span>?
          </p>

          <div className="space-y-2">
            <button
              onClick={() => onChoice(true)}
              className="w-full wood-panel rounded-lg border border-border p-4 text-left hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="brass-gradient rounded-lg p-2">
                  <Minimize2 className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Compress & Save</p>
                  <p className="text-xs text-muted-foreground">
                    Reduce file size to save storage space
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => onChoice(false)}
              className="w-full wood-panel rounded-lg border border-border p-4 text-left hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="brass-gradient rounded-lg p-2">
                  <Maximize2 className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Original Quality</p>
                  <p className="text-xs text-muted-foreground">
                    Keep full quality (uses more storage)
                  </p>
                </div>
              </div>
            </button>
          </div>

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompressionChoiceDialog;
