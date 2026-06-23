import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { useEffect, useMemo } from "react";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    storage: "50 MB",
    storageBytes: 50 * 1024 * 1024,
    price: 0,
    duration: null,
    durationYears: 0,
    retrievalFee: 0,
    description: "For students and light users",
  },
  {
    id: "2gb",
    name: "Standard",
    storage: "2 GB",
    storageBytes: 2 * 1024 * 1024 * 1024,
    price: 29,
    duration: "1 Year",
    durationYears: 1,
    retrievalFee: 7,
    description: "Active document management",
  },
  {
    id: "5gb",
    name: "Plus",
    storage: "5 GB",
    storageBytes: 5 * 1024 * 1024 * 1024,
    price: 36,
    duration: "2 Years",
    durationYears: 2,
    retrievalFee: 10,
    description: "Families & professionals",
  },
  {
    id: "15gb",
    name: "Pro",
    storage: "15 GB",
    storageBytes: 15 * 1024 * 1024 * 1024,
    price: 80,
    duration: "5 Years",
    durationYears: 5,
    retrievalFee: 22,
    description: "Best value, long-term",
  },
  {
    id: "40gb",
    name: "Elite",
    storage: "40 GB",
    storageBytes: 40 * 1024 * 1024 * 1024,
    price: 140,
    duration: "10 Years",
    durationYears: 10,
    retrievalFee: 40,
    description: "Ultimate decade storage",
  },
];

interface SubscriptionRow {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  storage_limit_bytes: number;
  expires_at: string | null;
  retrieval_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!data) {
        const { data: created } = await supabase
          .from("user_subscriptions")
          .insert({
            user_id: user!.id,
            tier: "free",
            status: "active",
            storage_limit_bytes: 50 * 1024 * 1024,
          })
          .select()
          .single();
        return created as unknown as SubscriptionRow;
      }
      return data as unknown as SubscriptionRow;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // Expired premium subscriptions are treated as frozen client-side.
  // Status changes are managed server-side by edge functions only (RLS-protected).
  const isExpiredPremium =
    !!subscription &&
    subscription.tier !== "free" &&
    !!subscription.expires_at &&
    new Date(subscription.expires_at) < new Date();

  const storageLimit = subscription?.storage_limit_bytes ?? 50 * 1024 * 1024;
  const storageUsed = useMemo(
    () => (documents as any[]).reduce((sum, d) => sum + (d.file_size || 0), 0),
    [documents]
  );
  const storagePercent =
    storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;

  const isFrozen = subscription?.status === "frozen";
  const retrievalExpiresAt = subscription?.retrieval_expires_at;
  const isRetrievalActive = retrievalExpiresAt
    ? new Date(retrievalExpiresAt) > new Date()
    : false;
  const canAccess = !isFrozen || isRetrievalActive;
  const canUpload = canAccess && storageUsed < storageLimit;

  // Expired premium users get free tier access (50MB)
  const isExpiredPremium = subscription?.tier !== "free" && isFrozen && !isRetrievalActive;

  const expiresAt = subscription?.expires_at;
  const daysUntilExpiry =
    expiresAt && subscription?.tier !== "free"
      ? differenceInDays(new Date(expiresAt), new Date())
      : null;
  const showExpiryWarning =
    daysUntilExpiry !== null && daysUntilExpiry <= 60 && daysUntilExpiry > 0;

  const retrievalDaysLeft = isRetrievalActive
    ? differenceInDays(new Date(retrievalExpiresAt!), new Date())
    : 0;

  const currentPlan = PLANS.find((p) => p.id === subscription?.tier) ?? PLANS[0];

  return {
    subscription,
    isLoading: subLoading,
    storageLimit,
    storageUsed,
    storagePercent,
    isFrozen,
    isExpiredPremium,
    isRetrievalActive,
    retrievalDaysLeft,
    canAccess,
    canUpload,
    showExpiryWarning,
    daysUntilExpiry,
    currentPlan,
  };
}
