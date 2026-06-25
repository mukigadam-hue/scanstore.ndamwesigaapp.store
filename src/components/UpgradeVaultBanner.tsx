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

const DISMISS_KEY = "vault_upgrade_banner_dismissed_v1";

export function UpgradeVaultBanner() {
  const { user } = useAuth();
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [open, setOpen] = useState(false);
  const detected = useDetectedCountry();
  const [country, setCountry] = useState<Country>(detected);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
      toast.error("Please enter a valid phone number");
      return;
    }
    if (!/^\d{5}$/.test(pin)) {
      toast.error("PIN must be exactly 5 digits");
      return;
    }
    if (pin !== pin2) {
      toast.error("PINs do not match");
      return;
    }
    setSubmitting(true);
    try {
      const fullPhone = country.dial + phone.replace(/\D/g, "");
      const { data, error } = await supabase.functions.invoke("phone-pin-attach", {
        body: { phone: fullPhone, pin, countryCode: country.code },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "Could not link phone");
        return;
      }
      toast.success("Vault identity upgraded!");
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
          <p className="font-semibold text-sm">Upgrade your vault identity</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add a phone number and 5-digit PIN so you never lose access — even if you
            forget your email.
          </p>
          <Button
            size="sm"
            className="mt-2 brass-gradient text-primary-foreground"
            onClick={() => setOpen(true)}
          >
            Add phone + PIN
          </Button>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
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
            <DialogTitle>Add phone + PIN</DialogTitle>
            <DialogDescription>
              Used for fast unlock and account recovery. Your email login keeps working.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <CountryCodePicker value={country} onChange={setCountry} />
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 h-11"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center">
                Create a 5-digit Vault PIN
              </p>
              <PinInput length={5} value={pin} onChange={setPin} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center">Confirm PIN</p>
              <PinInput length={5} value={pin2} onChange={setPin2} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Not now
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="brass-gradient text-primary-foreground"
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
