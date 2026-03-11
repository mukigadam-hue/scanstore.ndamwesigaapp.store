import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Timer, Shield } from "lucide-react";

interface AutoLockSettingsProps {
  open: boolean;
  onClose: () => void;
  currentTimeout: number; // in seconds
  onSave: (seconds: number) => void;
}

const AutoLockSettings = ({ open, onClose, currentTimeout, onSave }: AutoLockSettingsProps) => {
  const [value, setValue] = useState(currentTimeout);

  const handleSave = () => {
    onSave(value);
    onClose();
  };

  const formatTime = (seconds: number) => {
    if (seconds === 0) return "Disabled";
    if (seconds < 60) return `${seconds} seconds`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60 > 0 ? `${seconds % 60}s` : ""}`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display brass-text flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Auto-Lock Timer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="wood-panel rounded-lg border border-border p-4">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                Automatically lock your locker after inactivity
              </p>
            </div>

            <div className="space-y-4">
              <div className="text-center">
                <span className="text-2xl font-display font-bold brass-text">
                  {formatTime(value)}
                </span>
              </div>

              <Slider
                value={[value]}
                onValueChange={([v]) => setValue(v)}
                min={0}
                max={120}
                step={10}
                className="w-full"
              />

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Off</span>
                <span>30s</span>
                <span>1m</span>
                <span>2m</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 brass-gradient text-primary-foreground hover:opacity-90"
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AutoLockSettings;
