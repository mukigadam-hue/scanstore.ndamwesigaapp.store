import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { registerInterstitialHost } from "@/lib/ads";

const SKIP_SECONDS = 5;

export default function InterstitialAdOverlay() {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<string>("");
  const [countdown, setCountdown] = useState(SKIP_SECONDS);
  const resolverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    registerInterstitialHost((t, resolve) => {
      resolverRef.current = resolve;
      setTrigger(t);
      setCountdown(SKIP_SECONDS);
      setOpen(true);
    });
    return () => registerInterstitialHost(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [open, countdown]);

  const close = () => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-xs text-white/70">
        <span>Advertisement</span>
        {countdown > 0 ? (
          <span>Skip in {countdown}s</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={close}
            className="h-8 text-white hover:bg-white/10"
          >
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-6">
        <div
          className="w-full max-w-md h-[250px] rounded-md border border-white/10 bg-white/5 flex items-center justify-center text-white/40 text-sm"
          data-ad-slot={`interstitial-${trigger}`}
        >
          {/* === REPLACE WITH YOUR INTERSTITIAL AD SDK === */}
          Ad
        </div>
      </div>
    </div>,
    document.body
  );
}
