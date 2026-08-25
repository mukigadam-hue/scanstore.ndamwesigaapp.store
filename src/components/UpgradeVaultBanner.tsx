import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CountryCodePicker, useDetectedCountry, Country } from "./CountryCodePicker";
import { PinInput } from "./PinInput";
import { toast } from "sonner";
import { Shield, X, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

const DISMISS_KEY = "vault_upgrade_banner_dismissed_v1";

export function UpgradeVaultBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [open, setOpen] = useState(false);
  const detected = useDetectedCountry();
  const [country, setCountry] = useState<Country>(detected);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    setCountry(detected);
  }, [detected]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone_e164, pin_hash")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.phone_e164 || !data?.pin_hash) setNeedsUpgrade(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!needsUpgrade || dismissed) return null;

  const handleSubmit = async () => {
    if (!/^\d{5,}$/.test(phone.replace(/\D/g, ""))) {
      toast.error(t("billing.vaultBanner.invalidPhone"));
      return;
    }
    if (!/^\d{5}$/.test(pin)) {
      toast.error(t("billing.vaultBanner.pinLength"));
      return;
    }
    if (pin !== pin2) {
      toast.error(t("billing.vaultBanner.pinMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const fullPhone = country.dial + phone.replace(/\D/g, "");
      const { data, error } = await supabase.functions.invoke("phone-pin-attach", {
        body: { phone: fullPhone, pin, countryCode: country.code },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || t("billing.vaultBanner.linkFailed"));
        return;
      }
      toast.success(t("billing.vaultBanner.upgraded"));
      setNeedsUpgrade(false);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="relative rounded-lg border border-primary/30 bg-primary/10 p-4 mb-4 flex items-start gap-3">
        <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{t("billing.vaultBanner.title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("billing.vaultBanner.description")}
          </p>
          <Button
            size="sm"
            className="mt-2 brass-gradient text-primary-foreground"
            onClick={() => setOpen(true)}
          >
            {t("billing.vaultBanner.addPhonePin")}
          </Button>
        </div>
        <button
          type="button"
          aria-label={t("billing.vaultBanner.dismiss")}
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("billing.vaultBanner.addPhonePin")}</DialogTitle>
            <DialogDescription>
              {t("billing.vaultBanner.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <CountryCodePicker value={country} onChange={setCountry} />
              <Input
                type="tel"
                inputMode="numeric"
                placeholder={t("billing.vaultBanner.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 h-11"
              />
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <p className="text-xs text-muted-foreground">
                  {t("billing.vaultBanner.createPin")}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPin((s) => !s)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={showPin ? t("billing.vaultBanner.hidePin") : t("billing.vaultBanner.showPin")}
                >
                  {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <PinInput length={5} value={pin} onChange={setPin} mask={!showPin} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center">{t("billing.vaultBanner.confirmPin")}</p>
              <PinInput length={5} value={pin2} onChange={setPin2} mask={!showPin} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              {t("billing.vaultBanner.notNow")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="brass-gradient text-primary-foreground"
            >
              {submitting ? t("billing.vaultBanner.saving") : t("billing.vaultBanner.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
