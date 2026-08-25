import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
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

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2
                 rounded-full bg-amber-600/95 text-white text-xs font-medium
                 px-3 py-1.5 shadow-lg backdrop-blur-sm pointer-events-none"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>{t("viewer.workingOfflineMode")}</span>
    </div>
  );
}
