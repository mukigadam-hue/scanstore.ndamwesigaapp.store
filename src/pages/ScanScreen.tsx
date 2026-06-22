import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CameraCapture from "@/components/CameraCapture";
import { showInterstitial, prefetchInterstitial } from "@/lib/ads";

export default function ScanScreen() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const handleCapture = async (file: File) => {
    setOpen(false);
    // Ad Trigger 2: after Done / Finish Scan
    await showInterstitial("finish-scan");
    // Stage the scanned file for the public viewer (no auth required).
    const r = new FileReader();
    r.onload = () => {
      sessionStorage.setItem(
        "viewerPendingFile",
        JSON.stringify({ name: file.name, type: file.type, dataUrl: r.result })
      );
      navigate("/view");
    };
    r.readAsDataURL(file);
  };

  const handleClose = () => {
    setOpen(false);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <ScanLine className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold brass-text font-display">Scan Document</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Snap a photo — we'll auto-crop, enhance contrast, and let you save or share.
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              prefetchInterstitial();
              setOpen(true);
            }}
            className="brass-gradient text-primary-foreground font-display"
          >
            <ScanLine className="h-4 w-4 mr-2" /> Open Camera
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>
      </div>
      <CameraCapture open={open} onClose={handleClose} onCapture={handleCapture} />
    </div>
  );
}
