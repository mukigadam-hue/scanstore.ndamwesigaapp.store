import { useEffect, useState } from "react";
import { Mail, Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

/** Reminder interval after a "Skip" — 12 hours. */
const REMIND_AFTER_MS = 12 * 60 * 60 * 1000;
const SNOOZE_KEY = (uid: string) => `profile_reminder_snoozed_${uid}`;

const isPlaceholderEmail = (email?: string | null) =>
  !email || /@vaultmail\.local$/i.test(email) || /^playreview@/i.test(email);

/**
 * Demo / phone-only accounts have no real contact details on file. Ask the
 * user to register an email + phone. They can save or skip — if they skip,
 * we remind them again the next time they open the vault after 12 hours.
 */
export default function CompleteProfileReminder() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const snoozedRaw = localStorage.getItem(SNOOZE_KEY(user.id));
        const snoozedAt = snoozedRaw ? parseInt(snoozedRaw, 10) : 0;
        if (snoozedAt && Date.now() - snoozedAt < REMIND_AFTER_MS) return;

        const { data } = await supabase
          .from("profiles")
          .select("email, phone, phone_e164")
          .eq("user_id", user.id)
          .maybeSingle();

        const hasEmail = !isPlaceholderEmail(data?.email || user.email);
        const hasPhone = Boolean(data?.phone_e164 || data?.phone);
        if (cancelled) return;

        if (!hasEmail || !hasPhone) {
          setEmail(hasEmail ? (data?.email || user.email || "") : "");
          setPhone(data?.phone_e164 || data?.phone || "");
          setOpen(true);
        }
      } catch {
        /* never block the vault on this */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const snooze = () => {
    try {
      if (user) localStorage.setItem(SNOOZE_KEY(user.id), String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const save = async () => {
    if (!user) return;
    const cleanEmail = email.trim();
    const cleanPhone = phone.trim();
    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast.error(t("auth.enterValidEmail"));
      return;
    }
    if (!cleanEmail && !cleanPhone) {
      toast.error(t("auth.addEmailOrPhone"));
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (cleanEmail) patch.email = cleanEmail;
      if (cleanPhone) {
        patch.phone = cleanPhone;
        patch.phone_e164 = "+" + cleanPhone.replace(/\D/g, "");
      }

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", user.id);
      if (error) throw error;

      if (cleanEmail) {
        // Best effort: also attach it to the login account.
        try {
          await supabase.auth.updateUser({ email: cleanEmail });
        } catch {
          /* confirmation may be required; profile is already saved */
        }
      }

      toast.success(t("auth.contactDetailsSaved"));
      try {
        localStorage.setItem(SNOOZE_KEY(user.id), String(Date.now()));
      } catch {
        /* ignore */
      }
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || t("auth.couldNotSaveDetails"));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? snooze() : setOpen(v))}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{t("auth.completeYourAccount")}</DialogTitle>
          <DialogDescription>
            {t("auth.completeAccountDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reminder-email" className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5" /> {t("auth.emailAddress")}
            </Label>
            <Input
              id="reminder-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.emailAddressPlaceholder2")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reminder-phone" className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5" /> {t("auth.phoneNumber")}
            </Label>
            <Input
              id="reminder-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t("auth.phoneNumberExamplePlaceholder")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={snooze} disabled={saving}>
            {t("auth.skipForNow")}
          </Button>
          <Button
            className="flex-1 brass-gradient text-primary-foreground font-semibold"
            onClick={save}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("auth.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
