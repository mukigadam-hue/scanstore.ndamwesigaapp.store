import { useState, useRef, useCallback, useEffect } from "react";
import { useAdPrefetch } from "@/hooks/useAdPrefetch";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X, FileText, Image as ImageIcon, Smartphone, Monitor, Flashlight, FlashlightOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraCapture = ({ open, onClose, onCapture }: CameraCaptureProps) => {
  useAdPrefetch(["landing-top", "verify-top", "verify-bottom"]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [scanOrientation, setScanOrientation] = useState<"portrait" | "landscape">("portrait");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [aiCleaning, setAiCleaning] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      setCaptured(null);

      // Check torch support
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.torch) {
        setTorchSupported(true);
      } else {
        setTorchSupported(false);
      }
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, []);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const newState = !torchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch {
      toast.error("Flashlight not available on this device");
    }
  };

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
    const dataUrl = canvas.toDataURL("image/png", 1.0);
    setCaptured(dataUrl);
    stopCamera();
  };

  const scanDocument = async () => {
    if (!videoRef.current || !canvasRef.current || !scanCanvasRef.current) return;
    setScanning(true);
    setScanProgress(0);

    const video = videoRef.current;
    const scanCanvas = scanCanvasRef.current;
    const mainCanvas = canvasRef.current;

    const videoEl = videoRef.current;
    const displayW = videoEl.clientWidth;
    const displayH = videoEl.clientHeight;
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;

    const scaleX = videoW / displayW;
    const scaleY = videoH / displayH;
    const coverScale = Math.min(scaleX, scaleY);

    const visibleW = displayW * coverScale;
    const visibleH = displayH * coverScale;
    const offsetX = (videoW - visibleW) / 2;
    const offsetY = (videoH - visibleH) / 2;

    const insetPx = 24;
    const cropX = offsetX + insetPx * coverScale;
    const cropY = offsetY + insetPx * coverScale;
    const cropW = visibleW - insetPx * 2 * coverScale;
    const cropH = visibleH - insetPx * 2 * coverScale;

    scanCanvas.width = cropW;
    scanCanvas.height = cropH;
    mainCanvas.width = cropW;
    mainCanvas.height = cropH;

    const scanCtx = scanCanvas.getContext("2d");
    if (!scanCtx) return;

    const duration = 1500;
    const startTime = Date.now();
    let lastRow = 0;

    const animateScanning = async () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setScanProgress(progress);

      const currentRow = Math.floor(progress * cropH);

      if (currentRow > lastRow) {
        const rowsToCopy = currentRow - lastRow;
        scanCtx.drawImage(
          video,
          cropX, cropY + lastRow, cropW, rowsToCopy,
          0, lastRow, cropW, rowsToCopy
        );
        lastRow = currentRow;
      }

      if (progress < 1) {
        requestAnimationFrame(animateScanning);
      } else {
        if (lastRow < cropH) {
          scanCtx.drawImage(
            video,
            cropX, cropY + lastRow, cropW, cropH - lastRow,
            0, lastRow, cropW, cropH - lastRow
          );
        }

        // Apply light local enhancement first
        const mainCtx = mainCanvas.getContext("2d");
        if (mainCtx) {
          mainCtx.filter = "contrast(1.12) brightness(1.02) saturate(1.05)";
          mainCtx.drawImage(scanCanvas, 0, 0);
          mainCtx.filter = "none";
        }

        const rawDataUrl = mainCanvas.toDataURL("image/jpeg", 0.92);
        setCaptured(rawDataUrl);
        stopCamera();
        setScanning(false);
        setScanProgress(0);

        // Now run AI cleaning automatically
        setAiCleaning(true);
        toast.info("AI is cleaning your scan...");
        try {
          const { data, error } = await supabase.functions.invoke("clean-scan", {
            body: { image: rawDataUrl },
          });
          if (error) throw error;
          if (data?.cleanedImage) {
            setCaptured(data.cleanedImage);
            toast.success("AI cleaned your document!");
          } else if (data?.error) {
            console.warn("AI clean warning:", data.error);
            toast.warning("AI cleaning unavailable. Using enhanced scan.");
          }
        } catch (err) {
          console.error("AI clean error:", err);
          toast.warning("AI cleaning failed. Using enhanced scan.");
        } finally {
          setAiCleaning(false);
        }
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
    const file = dataUrlToFile(captured, `photo_${Date.now()}.png`, "image/png");
    onCapture(file);
    handleClose();
  };

  const saveAsDocument = () => {
    if (!captured || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Use high-quality JPEG for PDF to keep file size manageable while preserving colors
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);

      const pdf = new jsPDF({
        orientation: scanOrientation === "landscape" ? "landscape" : "portrait",
        unit: "mm",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const margin = 5;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);
      const scaledWidth = imgWidth * ratio;
      const scaledHeight = imgHeight * ratio;

      const xOffset = (pageWidth - scaledWidth) / 2;
      const yOffset = (pageHeight - scaledHeight) / 2;

      pdf.addImage(jpegDataUrl, "JPEG", xOffset, yOffset, scaledWidth, scaledHeight, undefined, "FAST");

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

  if (!open) return null;

  const overlay = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={scanCanvasRef} className="hidden" />

      {/* Top bar */}
      <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2 safe-area-top z-10">
        <h3 className="text-white text-sm font-medium truncate flex-1">
          {scanning ? "Scanning document…" : captured ? "Preview" : "Camera & Scanner"}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {!captured && !scanning && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleOrientation}
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs gap-1"
            >
              {scanOrientation === "portrait" ? (
                <Smartphone className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
              {scanOrientation === "portrait" ? "Portrait" : "Landscape"}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClose}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {!captured ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Scanner frame guide */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-6 border-2 border-white/30 rounded-lg" />
              <div className="absolute top-6 left-6 w-8 h-8 border-t-3 border-l-3 border-primary rounded-tl-lg" style={{borderTopWidth: 3, borderLeftWidth: 3}} />
              <div className="absolute top-6 right-6 w-8 h-8 border-t-3 border-r-3 border-primary rounded-tr-lg" style={{borderTopWidth: 3, borderRightWidth: 3}} />
              <div className="absolute bottom-6 left-6 w-8 h-8 border-b-3 border-l-3 border-primary rounded-bl-lg" style={{borderBottomWidth: 3, borderLeftWidth: 3}} />
              <div className="absolute bottom-6 right-6 w-8 h-8 border-b-3 border-r-3 border-primary rounded-br-lg" style={{borderBottomWidth: 3, borderRightWidth: 3}} />
            </div>

            {/* Scanning animation */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute left-0 right-0 top-0"
                  style={{
                    height: `${scanProgress * 100}%`,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                  }}
                />
                <div
                  className="absolute left-0 right-0 bottom-0"
                  style={{
                    height: `${(1 - scanProgress) * 100}%`,
                    background: "rgba(0,0,0,0.35)",
                  }}
                />
                <div
                  className="absolute left-0 right-0 h-1"
                  style={{
                    top: `${scanProgress * 100}%`,
                    boxShadow: "0 0 20px 6px hsl(var(--primary) / 0.7), 0 0 40px 12px hsl(var(--primary) / 0.3)",
                    background: `linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 15%, hsl(45 80% 70%) 50%, hsl(var(--primary)) 85%, transparent 100%)`,
                  }}
                />
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <span className="text-white text-sm font-medium bg-black/60 px-3 py-1 rounded-full">
                    Scanning… {Math.round(scanProgress * 100)}%
                  </span>
                </div>
              </div>
            )}

            {!streaming && !scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <p className="text-white/60 text-sm">Starting camera...</p>
              </div>
            )}
          </>
        ) : (
          <img
            src={captured}
            alt="Captured"
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black/80 backdrop-blur-sm px-4 py-3 safe-area-bottom">
        {!captured ? (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={switchCamera}
              className="text-white/70 hover:text-white hover:bg-white/10 h-12 w-12"
              title="Switch camera"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>

            {/* Flashlight toggle */}
            {torchSupported && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTorch}
                className={`h-12 w-12 ${torchOn ? "text-yellow-400 bg-yellow-400/20" : "text-white/70 hover:text-white hover:bg-white/10"}`}
                title={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
              >
                {torchOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
              </Button>
            )}

            <Button
              onClick={takePhoto}
              disabled={!streaming || scanning}
              className="brass-gradient text-primary-foreground h-16 w-16 rounded-full hover:opacity-90"
              title="Take photo"
            >
              <Camera className="h-6 w-6" />
            </Button>
            <Button
              onClick={scanDocument}
              disabled={!streaming || scanning}
              variant="outline"
              className="h-12 rounded-full border-primary/50 text-primary hover:bg-primary/10 px-5 text-sm font-semibold"
              title="Scan document"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Scan
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-sm mx-auto">
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
                className="flex-1 text-white/70 hover:text-white"
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
                className="flex-1 text-white/70 hover:text-white"
                onClick={handleClose}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default CameraCapture;
