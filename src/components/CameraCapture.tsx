import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraCapture = ({ open, onClose, onCapture }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      setCaptured(null);
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, []);

  // Start camera when dialog opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => startCamera(facingMode), 100);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
      setCaptured(null);
    }
  }, [open]);

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
    stopCamera();
  };

  const switchCamera = async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    if (streaming) {
      await startCamera(newMode);
    }
  };

  const dataUrlToFile = (dataUrl: string, filename: string, type: string): File => {
    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type });
    return new File([blob], filename, { type });
  };

  const saveAsImage = () => {
    if (!captured) return;
    const file = dataUrlToFile(captured, `photo_${Date.now()}.jpg`, "image/jpeg");
    onCapture(file);
    handleClose();
  };

  const saveAsDocument = () => {
    if (!captured) return;
    // Save as high-quality JPEG scan
    const file = dataUrlToFile(captured, `scan_${Date.now()}.jpg`, "image/jpeg");
    onCapture(file);
    toast.success("Document scanned and saved!");
    handleClose();
  };

  const handleClose = () => {
    stopCamera();
    setCaptured(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="font-display brass-text flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera & Scanner
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Take a photo or scan a document
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <canvas ref={canvasRef} className="hidden" />

          {!captured ? (
            <>
              <div className="relative aspect-[4/3] bg-background">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Scan guide overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-8 border-2 border-primary/40 rounded-lg" />
                  <div className="absolute top-8 left-8 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                  <div className="absolute top-8 right-8 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-8 left-8 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-8 right-8 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
                </div>
                {!streaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <p className="text-muted-foreground text-sm">Starting camera...</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-4 p-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={switchCamera}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
                <Button
                  onClick={takePhoto}
                  disabled={!streaming}
                  className="brass-gradient text-primary-foreground h-14 w-14 rounded-full hover:opacity-90"
                >
                  <Camera className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="aspect-[4/3] bg-background">
                <img
                  src={captured}
                  alt="Captured"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Save as image or scan as document
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={saveAsImage}
                    className="flex-1 brass-gradient text-primary-foreground hover:opacity-90"
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Save Photo
                  </Button>
                  <Button
                    onClick={saveAsDocument}
                    className="flex-1 brass-gradient text-primary-foreground hover:opacity-90"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Save Scan
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1 text-muted-foreground"
                    onClick={() => {
                      setCaptured(null);
                      startCamera(facingMode);
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retake
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 text-muted-foreground"
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CameraCapture;
