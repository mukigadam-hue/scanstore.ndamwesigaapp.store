import { motion } from "framer-motion";
import { AlertTriangle, Snowflake, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useState } from "react";
import PricingDialog from "./PricingDialog";
import PaymentDialog from "./PaymentDialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const PAYMENTS_ENABLED = false;

const SubscriptionAlert = () => {
  const { t } = useTranslation();
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

  const upcoming = () =>
    toast.info(t("billing.upcomingFeature"), {
      description: t("billing.upcomingFeatureDescription"),
    });

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
                  {t("billing.alert.vaultFrozenTitle")}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {t("billing.alert.vaultFrozenBody1")}{" "}
                  <span className="text-foreground font-medium">
                    ${currentPlan.retrievalFee}
                  </span>{" "}
                  {t("billing.alert.vaultFrozenBody2")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => PAYMENTS_ENABLED ? setShowRetrieval(true) : upcoming()}
                  className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10 whitespace-nowrap"
                >
                  {t("billing.alert.unlock", { fee: currentPlan.retrievalFee })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => PAYMENTS_ENABLED ? setShowPricing(true) : upcoming()}
                  className="text-xs brass-gradient text-primary-foreground whitespace-nowrap"
                >
                  {t("billing.alert.resubscribe")}
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
                  {t("billing.alert.temporaryAccessTitle")}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {retrievalDaysLeft <= 1
                    ? t("billing.alert.expiresTomorrow")
                    : t("billing.alert.daysRemaining", { days: retrievalDaysLeft })}{" "}
                  {t("billing.alert.resubscribeToKeep")}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => PAYMENTS_ENABLED ? setShowPricing(true) : upcoming()}
                className="text-xs brass-gradient text-primary-foreground shrink-0"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t("billing.alert.renew")}
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
                  {t("billing.alert.expiringSoonTitle")}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {t("billing.alert.planExpiresIn", { plan: currentPlan.name })}{" "}
                  <span className="text-yellow-500 font-medium">
                    {t("billing.alert.daysCount", { days: daysUntilExpiry })}
                  </span>
                  . {t("billing.alert.renewToAvoidFreeze")}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => PAYMENTS_ENABLED ? setShowPricing(true) : upcoming()}
                className="text-xs brass-gradient text-primary-foreground shrink-0"
              >
                {t("billing.alert.renewNow")}
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
