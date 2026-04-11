import { useState, useEffect, useRef, useCallback } from "react";
import { getPrefetchedAd, clearPrefetchedAd } from "@/hooks/useAdPrefetch";

interface NativeAdSlotProps {
  slotId: string;
  size?: "banner" | "medium";
  className?: string;
}

const NativeAdSlot = ({ slotId, size = "banner", className = "" }: NativeAdSlotProps) => {
  const [adKey, setAdKey] = useState<number>(() => {
    const prefetched = getPrefetchedAd(slotId);
    if (prefetched) {
      clearPrefetchedAd(slotId);
      return prefetched;
    }
    return Date.now();
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibleRef = useRef(true);

  const refreshAd = useCallback(() => {
    if (visibleRef.current) {
      setAdKey(Date.now());
    }
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(refreshAd, 60_000);

    const handleVisibility = () => {
      visibleRef.current = !document.hidden;
      if (document.hidden && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (!document.hidden && !intervalRef.current) {
        intervalRef.current = setInterval(refreshAd, 60_000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshAd]);

  const height = size === "banner" ? "h-[60px]" : "h-[90px]";

  return (
    <div
      className={`w-full ${height} overflow-hidden rounded-md border border-border bg-muted/30 flex items-center justify-center relative ${className}`}
      data-ad-slot={slotId}
      data-ad-key={adKey}
    >
      {/* === REPLACE THIS PLACEHOLDER WITH YOUR ADMOB/AD NETWORK SDK === */}
      <span className="text-[10px] text-muted-foreground/50 absolute top-1 right-2 select-none">
        Ad
      </span>
      <div className="text-xs text-muted-foreground/40 select-none">
        {/* Native ad placeholder — slot: {slotId} */}
        Sponsored
      </div>
      {/* === END AD PLACEHOLDER === */}
    </div>
  );
};

export default NativeAdSlot;
