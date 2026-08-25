import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"reason" | "verify">("reason");

  const { data: securitySettings } = useQuery({
    queryKey: ["security_settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("security_settings")
        .select("pin_hash, last_school")
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
      toast.error(t("security.delete.toast.reasonTooShort"));
      return;
    }
    setStep("verify");
  };

  const handleVerifyAndDelete = async () => {
    if (securitySettings?.pin_hash) {
      if (!user?.id) return;
      const { hashPin } = await import("@/lib/hashPin");
      const candidate = await hashPin(user.id, pin);
      if (candidate !== securitySettings.pin_hash) {
        toast.error(t("security.delete.toast.incorrectPin"));
        return;
      }
    } else if (securitySettings?.last_school) {
      if (pin.trim().toLowerCase() !== securitySettings.last_school.toLowerCase()) {
        toast.error(t("security.delete.toast.incorrectAnswer"));
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

  const verificationLabel = securitySettings?.pin_hash
    ? t("security.delete.label.enterPin")
    : securitySettings?.last_school
      ? t("security.delete.label.enterSchool")
      : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive font-display">
            <AlertTriangle className="h-5 w-5" />
            {t("security.delete.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-foreground">
              {t("security.delete.aboutToDelete")}
            </p>
            <p className="text-sm font-semibold text-destructive mt-1 truncate">
              {documentName}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t("security.delete.cannotUndo")}
            </p>
          </div>

          {step === "reason" && (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  {t("security.delete.label.reason")}
                </label>
                <Textarea
                  placeholder={t("security.delete.placeholder.reason")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground resize-none"
                  rows={3}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("security.delete.minChars", { count: reason.trim().length })}
                </p>
              </div>
              <Button
                className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleProceed}
                disabled={reason.trim().length < 6}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("security.delete.button.continueToVerification")}
              </Button>
            </>
          )}

          {step === "verify" && (
            <>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {verificationLabel || t("security.delete.label.typeDelete")}
                </label>
                <Input
                  type={securitySettings?.pin_hash ? "password" : "text"}
                  inputMode={securitySettings?.pin_hash ? "numeric" : "text"}
                  placeholder={
                    securitySettings?.pin_hash
                      ? "• • • • •"
                      : securitySettings?.last_school
                        ? t("security.delete.placeholder.schoolName")
                        : t("security.delete.placeholder.typeDelete")
                  }
                  value={pin}
                  onChange={(e) => {
                    if (securitySettings?.pin_hash) {
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
                  {t("security.delete.button.back")}
                </Button>
                <Button
                  className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleVerifyAndDelete}
                  disabled={!pin.trim()}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("security.delete.button.deletePermanently")}
                </Button>
              </div>
            </>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={handleClose}
          >
            {t("security.delete.button.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SecureDeleteDialog;
