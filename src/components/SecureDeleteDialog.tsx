import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Trash2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface SecureDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  documentName: string;
  onConfirmDelete: () => void;
}

const SecureDeleteDialog = ({ open, onClose, documentName, onConfirmDelete }: SecureDeleteDialogProps) => {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"reason" | "verify">("reason");

  const { data: securitySettings } = useQuery({
    queryKey: ["security_settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("security_settings")
        .select("pin_code, last_school")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const handleProceed = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 6) {
      toast.error("Reason must be at least 6 characters (e.g., 'Useless')");
      return;
    }
    setStep("verify");
  };

  const handleVerifyAndDelete = () => {
    if (securitySettings?.pin_code) {
      if (pin !== securitySettings.pin_code) {
        toast.error("Incorrect PIN. Deletion cancelled.");
        return;
      }
    } else if (securitySettings?.last_school) {
      if (pin.trim().toLowerCase() !== securitySettings.last_school.toLowerCase()) {
        toast.error("Incorrect answer. Deletion cancelled.");
        return;
      }
    }

    onConfirmDelete();
    handleClose();
  };

  const handleClose = () => {
    setReason("");
    setPin("");
    setStep("reason");
    onClose();
  };

  const verificationLabel = securitySettings?.pin_code
    ? "Enter your 5-digit PIN"
    : securitySettings?.last_school
      ? "Enter your last school name"
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive font-display">
            <AlertTriangle className="h-5 w-5" />
            Permanent Deletion
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-foreground">
              You are about to permanently delete:
            </p>
            <p className="text-sm font-semibold text-destructive mt-1 truncate">
              {documentName}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              This action cannot be undone. The file will be permanently removed from your locker.
            </p>
          </div>

          {step === "reason" && (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  Why are you deleting this document? *
                </label>
                <Textarea
                  placeholder="e.g., Duplicate file, outdated version, no longer needed..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={3}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum 6 characters ({reason.trim().length}/6)
                </p>
              </div>
              <Button
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleProceed}
                disabled={reason.trim().length < 6}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Continue to verification
              </Button>
            </>
          )}

          {step === "verify" && (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {verificationLabel || "Confirm deletion by typing DELETE"}
                </label>
                <Input
                  type={securitySettings?.pin_code ? "password" : "text"}
                  inputMode={securitySettings?.pin_code ? "numeric" : "text"}
                  placeholder={
                    securitySettings?.pin_code
                      ? "• • • • •"
                      : securitySettings?.last_school
                        ? "School name..."
                        : 'Type "DELETE"'
                  }
                  value={pin}
                  onChange={(e) => {
                    if (securitySettings?.pin_code) {
                      setPin(e.target.value.replace(/\D/g, "").slice(0, 5));
                    } else {
                      setPin(e.target.value);
                    }
                  }}
                  className="bg-input border-border text-foreground"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyAndDelete()}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 text-muted-foreground"
                  onClick={() => setStep("reason")}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleVerifyAndDelete}
                  disabled={!pin.trim()}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete permanently
                </Button>
              </div>
            </>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={handleClose}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SecureDeleteDialog;
