import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone, Building2, CheckCircle2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

// ── Configure your payment details here ──────────────────────────────────────
const MOBILE_MONEY_NUMBER = "+1 (000) 000-0000";
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

type Method = "mobile_money" | "bank_transfer";
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
      toast.error(err.message || "Failed to submit payment");
    } finally {
      setSubmitting(false);
    }
  };

  const copyRef = () => {
    navigator.clipboard.writeText(userRef);
    toast.success("Reference copied!");
  };

  const handleClose = () => {
    setStep("method");
    setMethod(null);
    setReference("");
    onClose();
  };

  const typeLabel =
    type === "subscription"
      ? "Subscription"
      : type === "retrieval"
        ? "Document Retrieval"
        : "Re-subscription";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="wood-panel border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display brass-text text-xl">
            {typeLabel} Payment
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose method */}
        {step === "method" && (
          <div className="space-y-4 pt-2">
            <div className="text-center">
              <p className="text-muted-foreground text-sm mb-1">Amount due</p>
              <p className="text-3xl font-bold font-display brass-text">${amount}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tierName} Plan
                {durationYears
                  ? ` · ${durationYears} Year${durationYears > 1 ? "s" : ""}`
                  : ""}
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Choose your payment method
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleMethodSelect("mobile_money")}
                className="wood-panel rounded-lg border border-border p-4 flex flex-col items-center gap-2 hover:border-brass/50 transition-colors group"
              >
                <Smartphone className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-foreground">
                  Mobile Money
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  M-Pesa, Airtel, MTN & more
                </span>
              </button>
              <button
                onClick={() => handleMethodSelect("bank_transfer")}
                className="wood-panel rounded-lg border border-border p-4 flex flex-col items-center gap-2 hover:border-brass/50 transition-colors group"
              >
                <Building2 className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-foreground">
                  Bank Transfer
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  Direct bank payment
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Payment details */}
        {step === "details" && method && (
          <div className="space-y-4 pt-2">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 border border-border">
              {method === "mobile_money" ? (
                <>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Send via Mobile Money
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Number:</span>
                      <span className="text-foreground font-medium">
                        {MOBILE_MONEY_NUMBER}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="text-primary font-bold">${amount}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">Reference:</span>
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
                    Include the reference in your payment message.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Bank Transfer Details
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bank:</span>
                      <span className="text-foreground font-medium">
                        {BANK_NAME}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Account:</span>
                      <span className="text-foreground font-medium">
                        {BANK_ACCOUNT}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="text-foreground font-medium">
                        {BANK_ACCOUNT_NAME}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="text-primary font-bold">${amount}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">Reference:</span>
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
                    Use the reference as the transfer description.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                {method === "mobile_money"
                  ? "Transaction ID / M-Pesa Code"
                  : "Bank Transaction Reference"}
              </Label>
              <Input
                placeholder={
                  method === "mobile_money"
                    ? "e.g. QAB12345CD"
                    : "e.g. TXN20240101001"
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
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!reference.trim() || submitting}
                className="flex-1 brass-gradient text-primary-foreground"
              >
                {submitting ? "Submitting..." : "Submit Payment"}
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
                Payment Submitted!
              </p>
              <p className="text-muted-foreground text-sm mt-2">
                Your payment is under review. Your account will be activated
                within 24 hours once confirmed.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Questions? Email us at{" "}
                <span className="text-primary">{SUPPORT_EMAIL}</span>
              </p>
            </div>
            <Button
              onClick={handleClose}
              className="brass-gradient text-primary-foreground w-full"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog;
