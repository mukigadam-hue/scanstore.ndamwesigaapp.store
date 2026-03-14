import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X, FileText, Image as ImageIcon, Smartphone, Monitor } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

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
  const [scanOrientation, setScanOrientation] = useState<"portrait" | "landscape">("portrait");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    try {
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

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => startCamera(facingMode), 100);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
      setCaptured(null);
      setScanning(false);
      setScanProgress(0);
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

  const scanDocument = () => {
    if (!videoRef.current || !canvasRef.current) return;
    setScanning(true);
    setScanProgress(0);

    const duration = 1200; // 1.2 seconds scan
    const startTime = Date.now();

    const animateScanning = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setScanProgress(progress);

      if (progress < 1) {
        requestAnimationFrame(animateScanning);
      } else {
        // Scan complete - capture the frame
        const video = videoRef.current!;
        const canvas = canvasRef.current!;

        // Capture based on chosen orientation
        if (scanOrientation === "portrait") {
          // For portrait: capture full frame, the PDF will be portrait A4
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        } else {
          // For landscape: capture full frame, the PDF will be landscape
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
          setCaptured(dataUrl);
        }
        stopCamera();
        setScanning(false);
        setScanProgress(0);
      }
    };

    requestAnimationFrame(animateScanning);
  };

  const switchCamera = async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    if (streaming) {
      await startCamera(newMode);
    }
  };

  const toggleOrientation = () => {
    setScanOrientation((prev) => (prev === "portrait" ? "landscape" : "portrait"));
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
    if (!captured || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Use the scan orientation for PDF
      const pdf = new jsPDF({
        orientation: scanOrientation === "landscape" ? "landscape" : "portrait",
        unit: "mm",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 10;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);
      const scaledWidth = imgWidth * ratio;
      const scaledHeight = imgHeight * ratio;

      const xOffset = (pageWidth - scaledWidth) / 2;
      const yOffset = (pageHeight - scaledHeight) / 2;

      pdf.addImage(captured, "JPEG", xOffset, yOffset, scaledWidth, scaledHeight);

      const pdfBlob = pdf.output("blob");
      const pdfFile = new File([pdfBlob], `scan_${Date.now()}.pdf`, {
        type: "application/pdf",
      });

      onCapture(pdfFile);
      toast.success("Document scanned and saved as PDF!");
      handleClose();
    } catch (err) {
      console.error("PDF creation error:", err);
      toast.error("Failed to create PDF. Saving as image instead.");
      saveAsImage();
    }
  };

  const handleClose = () => {
    stopCamera();
    setCaptured(null);
    setScanning(false);
    setScanProgress(0);
    onClose();
  };

  const aspectClass = scanOrientation === "portrait" ? "aspect-[3/4]" : "aspect-[4/3]";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="font-display brass-text flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera & Scanner
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Take a photo or scan a document into PDF
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <canvas ref={canvasRef} className="hidden" />

          {!captured ? (
            <>
              <div className={`relative ${aspectClass} bg-background overflow-hidden`}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Scanner frame guide */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-6 border-2 border-primary/40 rounded-lg" />
                  <div className="absolute top-6 left-6 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                  <div className="absolute top-6 right-6 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                  <div className="absolute bottom-6 left-6 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                  <div className="absolute bottom-6 right-6 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />
                </div>

                {/* Scanning animation overlay */}
                {scanning && (
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Darkened area above scan line */}
                    <div
                      className="absolute left-0 right-0 top-0 bg-primary/10 transition-none"
                      style={{ height: `${scanProgress * 100}%` }}
                    />
                    {/* Bright scan line */}
                    <div
                      className="absolute left-0 right-0 h-1 shadow-[0_0_16px_4px_hsl(var(--primary)/0.6)]"
                      style={{
                        top: `${scanProgress * 100}%`,
                        background: `linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 20%, hsl(var(--brass-light)) 50%, hsl(var(--primary)) 80%, transparent 100%)`,
                      }}
                    />
                  </div>
                )}

                {!streaming && !scanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <p className="text-muted-foreground text-sm">Starting camera...</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={switchCamera}
                    className="text-muted-foreground hover:text-foreground"
                    title="Switch camera"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleOrientation}
                    className="text-muted-foreground hover:text-foreground text-xs gap-1"
                    title={`Switch to ${scanOrientation === "portrait" ? "landscape" : "portrait"}`}
                  >
                    {scanOrientation === "portrait" ? (
                      <Smartphone className="h-4 w-4" />
                    ) : (
                      <Monitor className="h-4 w-4" />
                    )}
                    {scanOrientation === "portrait" ? "Portrait" : "Landscape"}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={takePhoto}
                    disabled={!streaming || scanning}
                    className="brass-gradient text-primary-foreground h-12 w-12 rounded-full hover:opacity-90"
                    title="Take photo"
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                  <Button
                    onClick={scanDocument}
                    disabled={!streaming || scanning}
                    variant="outline"
                    className="h-12 rounded-full border-primary/40 text-primary hover:bg-primary/10 px-4 text-xs font-semibold"
                    title="Scan document"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Scan
                  </Button>
                </div>

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
              <div className={`${aspectClass} bg-background`}>
                <img
                  src={captured}
                  alt="Captured"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Save as photo or scan as PDF document
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
                    Save as PDF
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
