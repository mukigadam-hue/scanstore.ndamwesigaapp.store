import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Crown, Zap } from "lucide-react";
import { PLANS, useSubscription } from "@/hooks/useSubscription";
import PaymentDialog from "./PaymentDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAYMENTS_ENABLED = false;

interface PricingDialogProps {
  open: boolean;
  onClose: () => void;
}

const PricingDialog = ({ open, onClose }: PricingDialogProps) => {
  const { currentPlan, isFrozen } = useSubscription();
  const [payingPlan, setPayingPlan] = useState<(typeof PLANS)[0] | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="wood-panel border-border max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display brass-text text-2xl">
              Choose Your Plan
            </DialogTitle>
            <p className="text-muted-foreground text-sm">
              Secure storage for all your important documents
            </p>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan.id;
              const isUpgrade =
                PLANS.indexOf(plan) > PLANS.indexOf(currentPlan);

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "rounded-lg border p-4 space-y-3 relative transition-all",
                    isCurrent
                      ? "border-primary/50 bg-primary/5"
                      : "border-border wood-panel hover:border-brass/40"
                  )}
                >
                  {isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <span className="brass-gradient text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                        Current
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {plan.id !== "free" && (
                        <Crown className="h-4 w-4 text-primary" />
                      )}
                      <h3 className="font-display font-bold text-foreground">
                        {plan.name}
                      </h3>
                    </div>
                    <p className="text-2xl font-bold brass-text font-display">
                      {plan.price === 0 ? "Free" : `$${plan.price}`}
                    </p>
                    {plan.duration && (
                      <p className="text-xs text-muted-foreground">
                        {plan.duration}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">
                        {plan.storage} storage
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">Unlimited drawers</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">
                        Secure encryption
                      </span>
                    </div>
                    {plan.id !== "free" && (
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-foreground">
                          Retrieval: ${plan.retrievalFee}/week
                        </span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {plan.description}
                  </p>

                  {isCurrent ? (
                    <div className="text-center text-xs text-muted-foreground py-1.5 border border-border/50 rounded">
                      Active
                    </div>
                  ) : isUpgrade ? (
                    <Button
                      size="sm"
                      onClick={() => setPayingPlan(plan)}
                      className="w-full brass-gradient text-primary-foreground hover:opacity-90"
                    >
                      Upgrade to {plan.name}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            All plans include end-to-end encryption. Free plan documents are
            always accessible.
          </p>
        </DialogContent>
      </Dialog>

      {payingPlan && (
        <PaymentDialog
          open={!!payingPlan}
          onClose={() => setPayingPlan(null)}
          type={isFrozen ? "resubscription" : "subscription"}
          tier={payingPlan.id}
          tierName={payingPlan.name}
          amount={
            isFrozen
              ? currentPlan.retrievalFee + payingPlan.price
              : payingPlan.price
          }
          durationYears={payingPlan.durationYears}
        />
      )}
    </>
  );
};

export default PricingDialog;
