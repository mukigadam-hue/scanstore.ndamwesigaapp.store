import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
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
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

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

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
    if (streaming) startCamera();
  };

  const saveAsImage = () => {
    if (!captured) return;
    const byteString = atob(captured.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: "image/jpeg" });
    const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    handleClose();
  };

  const saveAsPdf = async () => {
    if (!captured || !canvasRef.current) return;
    // Create a simple PDF from the image using canvas
    const canvas = canvasRef.current;
    const imgData = canvas.toDataURL("image/jpeg", 0.85);

    // Simple PDF generation (minimal PDF structure)
    const img = new Image();
    img.src = imgData;
    await new Promise((r) => (img.onload = r));

    // Convert to blob as image for now (PDF generation would need a library)
    const byteString = atob(imgData.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: "image/jpeg" });
    const file = new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    toast.success("Document scanned and saved!");
    handleClose();
  };

  const handleClose = () => {
    stopCamera();
    setCaptured(null);
    onClose();
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) handleClose();
    else startCamera();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="font-display brass-text flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera & Scanner
          </DialogTitle>
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
                    Save as Photo
                  </Button>
                  <Button
                    onClick={saveAsPdf}
                    className="flex-1 brass-gradient text-primary-foreground hover:opacity-90"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Scan Document
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1 text-muted-foreground"
                    onClick={() => {
                      setCaptured(null);
                      startCamera();
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
