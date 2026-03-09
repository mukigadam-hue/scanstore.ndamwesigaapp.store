import { HardDrive } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

const StorageBar = () => {
  const { storageUsed, storagePercent, currentPlan } = useSubscription();
  const isWarning = storagePercent >= 80;
  const isDanger = storagePercent >= 95;

  return (
    <div className="flex items-center gap-2.5 text-xs">
      <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="w-24 md:w-36">
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${storagePercent}%`,
              backgroundColor: isDanger
                ? "hsl(var(--destructive))"
                : isWarning
                  ? "hsl(45 90% 55%)"
                  : "hsl(var(--primary))",
            }}
          />
        </div>
      </div>
      <span className="text-muted-foreground whitespace-nowrap hidden sm:inline">
        {formatBytes(storageUsed)} / {currentPlan.storage}
      </span>
    </div>
  );
};

export default StorageBar;
