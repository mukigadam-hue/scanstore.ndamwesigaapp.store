import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Building2, CheckCircle2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// ── Configure your payment details here ──────────────────────────────────────
const BANK_NAME = "Your Bank";
const BANK_ACCOUNT = "0000-0000-0000";
const BANK_ACCOUNT_NAME = "DocLocker Ltd";
const SUPPORT_EMAIL = "payments@doclocker.com";
// ─────────────────────────────────────────────────────────────────────────────

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  type: "subscription" | "retrieval" | "resubscription";
  tier: string;
  tierName: string;
  amount: number;
  durationYears?: number;
}

type Method = "card" | "bank_transfer";
type Step = "method" | "details" | "done";

const PaymentDialog = ({
  open,
  onClose,
  type,
  tier,
  tierName,
  amount,
  durationYears,
}: PaymentDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method | null>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const userRef = `DOC-${user?.id?.slice(0, 8).toUpperCase()}`;

  const handleMethodSelect = (m: Method) => {
    setMethod(m);
    setStep("details");
  };

  const handleSubmit = async () => {
    if (!reference.trim() || !user || !method) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("payment_requests" as any).insert({
        user_id: user.id,
        type,
        amount,
        tier,
        duration_years: durationYears,
        payment_method: method,
        payment_reference: reference.trim(),
        status: "pending",
      } as any);
      if (error) throw error;
      setStep("done");
    } catch (err: any) {
      toast.error(err.message || t("billing.payment.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const copyRef = () => {
    navigator.clipboard.writeText(userRef);
    toast.success(t("billing.payment.referenceCopied"));
  };

  const handleClose = () => {
    setStep("method");
    setMethod(null);
    setReference("");
    onClose();
  };

  const typeLabel =
    type === "subscription"
      ? t("billing.payment.typeSubscription")
      : type === "retrieval"
        ? t("billing.payment.typeRetrieval")
        : t("billing.payment.typeResubscription");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="wood-panel border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display brass-text text-xl">
            {t("billing.payment.title", { type: typeLabel })}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose method */}
        {step === "method" && (
          <div className="space-y-4 pt-2">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">{t("billing.payment.amountDue")}</p>
              <p className="text-3xl font-bold font-display brass-text">${amount}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("billing.payment.planLabel", { plan: tierName })}
                {durationYears
                  ? ` · ${durationYears} ${durationYears > 1 ? t("billing.payment.years") : t("billing.payment.year")}`
                  : ""}
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {t("billing.payment.chooseMethod")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleMethodSelect("card")}
                className="wood-panel rounded-lg border border-border p-4 flex flex-col items-center gap-2 hover:border-brass/50 transition-colors group"
              >
                <CreditCard className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-foreground">
                  {t("billing.payment.cardPayment")}
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  {t("billing.payment.cardSubtitle")}
                </span>
              </button>
              <button
                onClick={() => handleMethodSelect("bank_transfer")}
                className="wood-panel rounded-lg border border-border p-4 flex flex-col items-center gap-2 hover:border-brass/50 transition-colors group"
              >
                <Building2 className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-foreground">
                  {t("billing.payment.bankTransfer")}
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  {t("billing.payment.bankSubtitle")}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Payment details */}
        {step === "details" && method && (
          <div className="space-y-4 pt-2">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 border border-border">
              {method === "card" ? (
                <>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    {t("billing.payment.cardPayment")}
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("billing.payment.amount")}</span>
                      <span className="text-primary font-bold">${amount}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">{t("billing.payment.reference")}</span>
                      <button
                        onClick={copyRef}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <span className="font-mono text-xs">{userRef}</span>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.payment.cardCompleteInstructions")}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    {t("billing.payment.bankDetailsTitle")}
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("billing.payment.bank")}</span>
                      <span className="text-foreground font-medium">
                        {BANK_NAME}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("billing.payment.account")}</span>
                      <span className="text-foreground font-medium">
                        {BANK_ACCOUNT}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("billing.payment.name")}</span>
                      <span className="text-foreground font-medium">
                        {BANK_ACCOUNT_NAME}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t("billing.payment.amount")}</span>
                      <span className="text-primary font-bold">${amount}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">{t("billing.payment.reference")}</span>
                      <button
                        onClick={copyRef}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <span className="font-mono text-xs">{userRef}</span>
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("billing.payment.bankTransferInstructions")}
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                {method === "card"
                  ? t("billing.payment.cardTxnRef")
                  : t("billing.payment.bankTxnRef")}
              </Label>
              <Input
                placeholder={
                  method === "card"
                    ? t("billing.payment.cardTxnPlaceholder")
                    : t("billing.payment.bankTxnPlaceholder")
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="bg-input border-border text-foreground"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep("method")}
                className="text-muted-foreground"
              >
                {t("billing.payment.back")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!reference.trim() || submitting}
                className="flex-1 brass-gradient text-primary-foreground"
              >
                {submitting ? t("billing.payment.submitting") : t("billing.payment.submitPayment")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="space-y-4 pt-2 text-center">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-primary" />
            </div>
            <div>
              <p className="font-display font-semibold text-foreground text-lg">
                {t("billing.payment.submitted")}
              </p>
              <p className="text-muted-foreground text-sm mt-2">
                {t("billing.payment.underReview")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t("billing.payment.questions")}{" "}
                <span className="text-primary">{SUPPORT_EMAIL}</span>
              </p>
            </div>
            <Button
              onClick={handleClose}
              className="brass-gradient text-primary-foreground w-full"
            >
              {t("billing.payment.done")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog;
