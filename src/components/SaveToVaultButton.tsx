import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { setPendingVaultFile } from "@/lib/pendingVaultFile";
import { inferFileType } from "@/lib/fileCompatibility";
import { useTranslation } from "react-i18next";

interface Props {
  file: File | null;
  className?: string;
  label?: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function SaveToVaultButton({ file, className, label }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!file) {
      toast.error(t("vault.noDocumentToSave"));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingVaultFile({ name: file.name, type: inferFileType(file.name, file.type), dataUrl });

      // Offline: keep the file staged and tell the user it will be
      // saved to the vault the moment the connection returns. Do NOT
      // navigate to /auth (which asks the user to sign in again) or to
      // /locker (which needs a live session to verify security).
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      if (!online) {
        toast.success(t("vault.savedOffline"));
        setBusy(false);
        return;
      }

      // Always force through security verification at /locker.
      // /locker handles auth gate, MFA setup, SecurityVerify, then picks up pending file.
      navigate(user ? "/locker" : "/auth");
    } catch (e: any) {
      toast.error(e?.message || t("vault.couldNotStageFile"));
    } finally {
      setBusy(false);
    }
  };


  return (
    <Button
      onClick={handle}
      disabled={!file || busy}
      className={
        className ||
        "brass-gradient text-primary-foreground font-display font-semibold"
      }
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Shield className="h-4 w-4 mr-2" />
      )}
      {label || t("vault.saveToSecureVault")}
    </Button>
  );
}
