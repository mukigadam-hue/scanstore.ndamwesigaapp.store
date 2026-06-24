import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AD_NETWORK_READY } from "@/lib/ads";

interface BannerAdProps {
  /** Unique slot id, used for analytics / ad SDK targeting. */
  slot: string;
}

/**
 * Bottom-anchored banner ad.
 *
 * Renders two pieces:
 *  1. An in-flow spacer of the exact same height, so page content is never
 *     covered by the fixed banner (no layout shift, no hidden buttons).
 *  2. A fixed-position banner at the bottom of the viewport (via portal),
 *     so it stays visible while the rest of the page scrolls.
 *
 * Heights match standard ad units:
 *  - mobile  : 320×50  → 60px tall surface
 *  - tablet+ : 728×90  → 96px tall surface
 *
 * When the ad network isn't ready or the user is offline, the component
 * renders nothing — no placeholder, no reserved space, no jump.
 */
export default function BannerAd({ slot }: BannerAdProps) {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!AD_NETWORK_READY || !online) return null;

  return (
    <>
      {/* In-flow spacer matches the fixed banner's height so nothing is covered. */}
      <div aria-hidden="true" className="h-[60px] sm:h-[96px] w-full" />

      {createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center
                     border-t border-border bg-background/95 backdrop-blur
                     h-[60px] sm:h-[96px] animate-fade-in"
          role="complementary"
          aria-label="Advertisement"
        >
          <div
            data-ad-slot={`banner-${slot}`}
            className="w-[320px] h-[50px] sm:w-[728px] sm:h-[90px]
                       rounded-sm border border-border/60 bg-muted/40
                       flex items-center justify-center text-xs text-muted-foreground"
          >
            {/* === REPLACE WITH YOUR BANNER AD SDK (AdMob / AdSense) === */}
            Advertisement
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
