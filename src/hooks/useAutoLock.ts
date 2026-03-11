import { useEffect, useCallback, useRef } from "react";

interface UseAutoLockOptions {
  enabled: boolean;
  timeoutMs: number; // max 120000 (2 minutes)
  onLock: () => void;
}

export function useAutoLock({ enabled, timeoutMs, onLock }: UseAutoLockOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onLockRef.current();
    }, Math.min(timeoutMs, 120000));
  }, [enabled, timeoutMs]);

  useEffect(() => {
    if (!enabled) return;

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    const handler = () => resetTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, resetTimer]);
}
