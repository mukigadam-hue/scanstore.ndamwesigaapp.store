import { motion } from "framer-motion";
import { AlertTriangle, Snowflake, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useState } from "react";
import PricingDialog from "./PricingDialog";
import PaymentDialog from "./PaymentDialog";
import { toast } from "sonner";

const PAYMENTS_ENABLED = false;
const upcoming = () =>
  toast.info("Upcoming feature", {
    description: "Paid upgrades are coming soon. Keep enjoying the Free tier in the meantime.",
  });

const SubscriptionAlert = () => {
  const {
    isFrozen,
    isRetrievalActive,
    retrievalDaysLeft,
    showExpiryWarning,
    daysUntilExpiry,
    currentPlan,
  } = useSubscription();
  const [showPricing, setShowPricing] = useState(false);
  const [showRetrieval, setShowRetrieval] = useState(false);

  if (!isFrozen && !showExpiryWarning && !isRetrievalActive) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        {isFrozen && !isRetrievalActive && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Snowflake className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-destructive text-sm">
                  Vault Frozen
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Your subscription expired. Documents are safely preserved but
                  inaccessible. Pay a retrieval fee of{" "}
                  <span className="text-foreground font-medium">
                    ${currentPlan.retrievalFee}
                  </span>{" "}
                  for 1-week access, or resubscribe.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => PAYMENTS_ENABLED ? setShowRetrieval(true) : upcoming()}
                  className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10 whitespace-nowrap"
                >
                  Unlock (${currentPlan.retrievalFee})
                </Button>
                <Button
                  size="sm"
                  onClick={() => PAYMENTS_ENABLED ? setShowPricing(true) : upcoming()}
                  className="text-xs brass-gradient text-primary-foreground whitespace-nowrap"
                >
                  Resubscribe
                </Button>
              </div>
            </div>
          </div>
        )}

        {isRetrievalActive && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">
                  Temporary Access Active
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {retrievalDaysLeft <= 1
                    ? "Access expires tomorrow!"
                    : `${retrievalDaysLeft} days of access remaining.`}{" "}
                  Resubscribe to keep your documents accessible.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => PAYMENTS_ENABLED ? setShowPricing(true) : upcoming()}
                className="text-xs brass-gradient text-primary-foreground shrink-0"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Renew
              </Button>
            </div>
          </div>
        )}

        {showExpiryWarning && !isFrozen && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">
                  Subscription Expiring Soon
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Your {currentPlan.name} plan expires in{" "}
                  <span className="text-yellow-500 font-medium">
                    {daysUntilExpiry} days
                  </span>
                  . Renew to avoid document freezing.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => PAYMENTS_ENABLED ? setShowPricing(true) : upcoming()}
                className="text-xs brass-gradient text-primary-foreground shrink-0"
              >
                Renew Now
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      <PricingDialog
        open={showPricing}
        onClose={() => setShowPricing(false)}
      />

      {showRetrieval && (
        <PaymentDialog
          open={showRetrieval}
          onClose={() => setShowRetrieval(false)}
          type="retrieval"
          tier={currentPlan.id}
          tierName={currentPlan.name}
          amount={currentPlan.retrievalFee}
        />
      )}
    </>
  );
};

export default SubscriptionAlert;
