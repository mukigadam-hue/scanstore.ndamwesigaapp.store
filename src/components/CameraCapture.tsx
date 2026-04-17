import { useState, useRef, useCallback, useEffect } from "react";
import { useAdPrefetch } from "@/hooks/useAdPrefetch";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, X, FileText, Image as ImageIcon, Smartphone, Monitor, Flashlight, FlashlightOff, CreditCard, ScanLine, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { enhanceScanCanvas } from "@/lib/enhanceScan";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onScanStart?: () => void;
}

type ScanMode = "select" | "document" | "id-front" | "id-back" | "id-preview";

const CameraCapture = ({ open, onClose, onCapture, onScanStart }: CameraCaptureProps) => {
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

  // ID scanning state
  const [scanMode, setScanMode] = useState<ScanMode>("select");
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);

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
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreaming(true);
      setCaptured(null);

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
      setScanMode("select");
      setIdFrontImage(null);
      setIdBackImage(null);
    } else {
      stopCamera();
      setCaptured(null);
      setScanning(false);
      setScanProgress(0);
      setScanMode("select");
      setIdFrontImage(null);
      setIdBackImage(null);
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

  const performScan = async (): Promise<string | null> => {
    if (!videoRef.current || !canvasRef.current || !scanCanvasRef.current) return null;
    onScanStart?.();
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

    const isIdScan = scanMode === "id-front" || scanMode === "id-back";

    let cropX: number, cropY: number, cropW: number, cropH: number;

    if (isIdScan) {
      // Crop to the ID card frame (landscape rectangle centered on screen)
      const cardDisplayW = Math.min(displayW * 0.9, 380);
      const cardDisplayH = cardDisplayW / 1.586; // ID card aspect ratio
      const cardCenterX = displayW / 2;
      const cardCenterY = displayH / 2;

      cropX = offsetX + (cardCenterX - cardDisplayW / 2) * coverScale;
      cropY = offsetY + (cardCenterY - cardDisplayH / 2) * coverScale;
      cropW = cardDisplayW * coverScale;
      cropH = cardDisplayH * coverScale;
    } else {
      const insetPx = 24;
      cropX = offsetX + insetPx * coverScale;
      cropY = offsetY + insetPx * coverScale;
      cropW = visibleW - insetPx * 2 * coverScale;
      cropH = visibleH - insetPx * 2 * coverScale;
    }

    // Cap scan resolution to keep saving and AI cleaning fast on phones.
    let targetW = cropW;
    let targetH = cropH;
    const maxDimension = isIdScan ? 820 : 1600;
    if (targetW > maxDimension || targetH > maxDimension) {
      const scale = maxDimension / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }

    targetW = Math.max(1, Math.round(targetW));
    targetH = Math.max(1, Math.round(targetH));

    scanCanvas.width = targetW;
    scanCanvas.height = targetH;
    mainCanvas.width = targetW;
    mainCanvas.height = targetH;

    const scanCtx = scanCanvas.getContext("2d");
    if (!scanCtx) return null;

    return new Promise<string | null>((resolve) => {
      const duration = isIdScan ? 420 : 560;
      const startTime = Date.now();
      let lastRow = 0;

      const animateScanning = async () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setScanProgress(progress);

        const currentRow = Math.floor(progress * targetH);

        if (currentRow > lastRow) {
          const rowsToCopy = currentRow - lastRow;
          scanCtx.drawImage(
            video,
            cropX, cropY + (lastRow / targetH) * cropH, cropW, (rowsToCopy / targetH) * cropH,
            0, lastRow, targetW, rowsToCopy
          );
          lastRow = currentRow;
        }

        if (progress < 1) {
          requestAnimationFrame(animateScanning);
        } else {
          if (lastRow < targetH) {
            scanCtx.drawImage(
              video,
              cropX, cropY + (lastRow / targetH) * cropH, cropW, ((targetH - lastRow) / targetH) * cropH,
              0, lastRow, targetW, targetH - lastRow
            );
          }

          const mainCtx = mainCanvas.getContext("2d");
          if (mainCtx) {
            if (isIdScan) {
              const radius = Math.max(14, Math.round(Math.min(targetW, targetH) * 0.06));
              mainCtx.fillStyle = "#ffffff";
              mainCtx.fillRect(0, 0, targetW, targetH);
              mainCtx.save();
              mainCtx.beginPath();
              mainCtx.moveTo(radius, 0);
              mainCtx.lineTo(targetW - radius, 0);
              mainCtx.arcTo(targetW, 0, targetW, radius, radius);
              mainCtx.lineTo(targetW, targetH - radius);
              mainCtx.arcTo(targetW, targetH, targetW - radius, targetH, radius);
              mainCtx.lineTo(radius, targetH);
              mainCtx.arcTo(0, targetH, 0, targetH - radius, radius);
              mainCtx.lineTo(0, radius);
              mainCtx.arcTo(0, 0, radius, 0, radius);
              mainCtx.closePath();
              mainCtx.clip();
              mainCtx.drawImage(scanCanvas, 0, 0);
              mainCtx.restore();
            } else {
              mainCtx.drawImage(scanCanvas, 0, 0);
            }
          }

          const jpegQuality = isIdScan ? 0.74 : 0.86;
          const rawDataUrl = mainCanvas.toDataURL("image/jpeg", jpegQuality);
          stopCamera();
          setScanning(false);
          setScanProgress(0);

          resolve(rawDataUrl);

          // Background AI cleaning — runs after save, updates the preview silently
          (async () => {
            try {
              const { data } = await supabase.functions.invoke("clean-scan", {
                body: { image: rawDataUrl, isIdScan },
              });
              if (data?.cleanedImage && !data?.fallback) {
                // Update captured image in the background if still on preview
                setCaptured((prev) => (prev === rawDataUrl ? data.cleanedImage : prev));
              }
            } catch {
              // Silently fail — user already has the raw scan
            }
          })();
        }
      };

      requestAnimationFrame(animateScanning);
    });
  };

  const scanDocument = async () => {
    const result = await performScan();
    if (result) {
      setCaptured(result);
    }
  };

  // ID scanning functions
  const scanIdSide = async (side: "front" | "back") => {
    const result = await performScan();
    if (!result) return;

    if (side === "front") {
      setIdFrontImage(result);
      setScanMode("id-back");
      // Restart camera for back side
      setTimeout(() => startCamera(facingMode), 300);
    } else {
      setIdBackImage(result);
      setScanMode("id-preview");
    }
  };

  const combineIdSides = (): string | null => {
    if (!idFrontImage || !idBackImage) return null;

    // Create a canvas to combine both sides
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // A4 proportions at high res (portrait) - we'll place both ID images stacked
    const canvasW = 1748;
    const canvasH = 2480;
    const scale = canvasW / 2480;
    canvas.width = canvasW;
    canvas.height = canvasH;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw ID images without any text labels — just the scanned sides
    const drawSide = (img: HTMLImageElement, yStart: number, maxH: number) => {
      const margin = Math.round(80 * scale);
      const availW = canvasW - margin * 2;
      const ratio = Math.min(availW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = (canvasW - w) / 2;
      const y = yStart;

      // Card shadow
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = Math.round(20 * scale);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(3, Math.round(6 * scale));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
      ctx.shadowColor = "transparent";

      // Border
      ctx.strokeStyle = "#cccccc";
      ctx.lineWidth = Math.max(1, Math.round(2 * scale));
      ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);

      ctx.drawImage(img, x, y, w, h);
      return y + h;
    };

    return new Promise<string | null>((resolve) => {
      const frontImg = new Image();
      frontImg.onload = () => {
        const backImg = new Image();
        backImg.onload = () => {
          // Place front side in upper half, back side in lower half with a gap
          const gap = Math.round(80 * scale);
          const topMargin = Math.round(80 * scale);
          const availH = (canvasH - topMargin - gap) / 2;
          drawSide(frontImg, topMargin, availH);
          drawSide(backImg, topMargin + availH + gap, availH);
          resolve(canvas.toDataURL("image/jpeg", 0.84));
        };
        backImg.src = idBackImage!;
      };
      frontImg.src = idFrontImage!;
    }) as any;
  };

  const saveIdAsPdf = async () => {
    const combined = await combineIdSides();
    if (!combined) return;

    try {
      const img = new Image();
      img.onload = () => {
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", compress: true });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 5;
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;
        const ratio = Math.min(availW / img.width, availH / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;

        pdf.addImage(combined, "JPEG", x, y, w, h, undefined, "FAST");
        const pdfBlob = pdf.output("blob");
        const pdfFile = new File([pdfBlob], `id_scan_${Date.now()}.pdf`, { type: "application/pdf" });
        onCapture(pdfFile);
        toast.success("ID scanned and saved as PDF!");
        handleClose();
      };
      img.src = combined;
    } catch (err) {
      console.error("PDF creation error:", err);
      toast.error("Failed to create PDF.");
    }
  };

  const saveIdAsImage = async () => {
    const combined = await combineIdSides();
    if (!combined) return;
    const file = dataUrlToFile(combined, `id_scan_${Date.now()}.jpg`, "image/jpeg");
    onCapture(file);
    toast.success("ID scan saved!");
    handleClose();
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
    if (!captured) return;
    try {
      const img = new Image();
      img.onload = () => {
        const pdf = new jsPDF({
          orientation: scanOrientation === "landscape" ? "landscape" : "portrait",
          unit: "mm",
          compress: true,
        });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 5;
        const availableWidth = pageWidth - margin * 2;
        const availableHeight = pageHeight - margin * 2;
        const ratio = Math.min(availableWidth / img.width, availableHeight / img.height);
        const scaledWidth = img.width * ratio;
        const scaledHeight = img.height * ratio;
        const xOffset = (pageWidth - scaledWidth) / 2;
        const yOffset = (pageHeight - scaledHeight) / 2;
        const format = captured.includes("image/png") ? "PNG" : "JPEG";
        pdf.addImage(captured, format, xOffset, yOffset, scaledWidth, scaledHeight, undefined, "FAST");
        const pdfBlob = pdf.output("blob");
        const pdfFile = new File([pdfBlob], `scan_${Date.now()}.pdf`, { type: "application/pdf" });
        onCapture(pdfFile);
        toast.success("Document scanned and saved as PDF!");
        handleClose();
      };
      img.src = captured;
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
    setScanMode("select");
    setIdFrontImage(null);
    setIdBackImage(null);
    onClose();
  };

  const startDocumentMode = () => {
    setScanMode("document");
    startCamera(facingMode);
  };

  const startIdMode = () => {
    setScanMode("id-front");
    startCamera(facingMode);
  };

  if (!open) return null;

  // Mode selection screen
  if (scanMode === "select") {
    const selectOverlay = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
        <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between safe-area-top z-10">
          <h3 className="text-white text-sm font-medium">Choose Scan Mode</h3>
          <Button size="icon" variant="ghost" onClick={handleClose} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center px-6">
          <div className="grid grid-cols-1 gap-5 w-full max-w-sm">
            {/* Full Document */}
            <button
              onClick={startDocumentMode}
              className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6 text-left transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                  <FileText className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-white">Full Document</h4>
                  <p className="text-sm text-white/60 mt-1">
                    Scan a single page — letters, receipts, certificates, full-page documents
                  </p>
                </div>
              </div>
              <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="h-5 w-5 text-primary" />
              </div>
            </button>

            {/* ID Two-Sided */}
            <button
              onClick={startIdMode}
              className="group relative overflow-hidden rounded-2xl border-2 border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-amber-500/5 p-6 text-left transition-all hover:border-amber-400 hover:shadow-lg hover:shadow-amber-400/20 active:scale-[0.98]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-400/20">
                  <CreditCard className="h-7 w-7 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-bold text-white">ID Card (2-Sided)</h4>
                  <p className="text-sm text-white/60 mt-1">
                    Scan front & back of ID cards, driver's licenses — both sides on one A4 page
                  </p>
                </div>
              </div>
              <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="h-5 w-5 text-amber-400" />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
    return createPortal(selectOverlay, document.body);
  }

  // ID preview screen (both sides captured)
  if (scanMode === "id-preview" && idFrontImage && idBackImage) {
    const previewOverlay = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
        <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between safe-area-top z-10">
          <h3 className="text-white text-sm font-medium">ID Scan Preview — Both Sides</h3>
          <Button size="icon" variant="ghost" onClick={handleClose} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-4 py-4 gap-4">
          <div className="w-full max-w-md">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 text-center">Front Side</p>
            <div className="rounded-xl overflow-hidden border-2 border-white/10 shadow-lg">
              <img src={idFrontImage} alt="ID Front" className="w-full object-contain bg-white" />
            </div>
          </div>
          <div className="w-full max-w-md">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-2 text-center">Back Side</p>
            <div className="rounded-xl overflow-hidden border-2 border-white/10 shadow-lg">
              <img src={idBackImage} alt="ID Back" className="w-full object-contain bg-white" />
            </div>
          </div>
        </div>

        <div className="bg-black/80 backdrop-blur-sm px-4 py-3 safe-area-bottom">
          <div className="space-y-2 max-w-sm mx-auto">
            <div className="flex gap-2">
              <Button onClick={saveIdAsImage} className="flex-1 brass-gradient text-primary-foreground hover:opacity-90">
                <ImageIcon className="h-4 w-4 mr-2" />
                Save Image
              </Button>
              <Button onClick={saveIdAsPdf} className="flex-1 brass-gradient text-primary-foreground hover:opacity-90">
                <FileText className="h-4 w-4 mr-2" />
                Save as PDF
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 text-white/70 hover:text-white"
                onClick={() => {
                  setIdFrontImage(null);
                  setIdBackImage(null);
                  setScanMode("id-front");
                  startCamera(facingMode);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Rescan Both
              </Button>
              <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
    return createPortal(previewOverlay, document.body);
  }

  // Determine labels for ID scanning
  const isIdMode = scanMode === "id-front" || scanMode === "id-back";
  const idSideLabel = scanMode === "id-front" ? "FRONT side" : "BACK side";

  const overlay = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={scanCanvasRef} className="hidden" />

      {/* Top bar */}
      <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2 safe-area-top z-10">
        <h3 className="text-white text-sm font-medium truncate flex-1">
          {scanning ? "Scanning…" : captured ? "Preview" : isIdMode ? `Scan ID — ${idSideLabel}` : "Document Scanner"}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {!captured && !scanning && !isIdMode && (
            <Button variant="ghost" size="sm" onClick={toggleOrientation} className="text-white/70 hover:text-white hover:bg-white/10 text-xs gap-1">
              {scanOrientation === "portrait" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              {scanOrientation === "portrait" ? "Portrait" : "Landscape"}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={handleClose} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {!captured ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

            {/* Scanner frame guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {isIdMode ? (
                /* ID card frame: only the card area is visible, rest is dark overlay */
              <>
                  {/* Card cutout: box-shadow darkens everything outside */}
                  <div className="absolute rounded-xl overflow-hidden" style={{ width: '90%', aspectRatio: '1.586/1', maxWidth: '380px', border: '2.5px solid rgba(255,255,255,0.6)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)' }} />
                  <div className="absolute" style={{ width: '90%', aspectRatio: '1.586/1', maxWidth: '380px' }}>
                    <div className="absolute top-0 left-0 w-8 h-8 border-amber-400 rounded-tl-lg" style={{borderTopWidth: 3, borderLeftWidth: 3}} />
                    <div className="absolute top-0 right-0 w-8 h-8 border-amber-400 rounded-tr-lg" style={{borderTopWidth: 3, borderRightWidth: 3}} />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-amber-400 rounded-bl-lg" style={{borderBottomWidth: 3, borderLeftWidth: 3}} />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-amber-400 rounded-br-lg" style={{borderBottomWidth: 3, borderRightWidth: 3}} />
                  </div>
                </>
              ) : (
                /* Full document frame */
                <>
                  <div className="absolute inset-6 border-2 border-white/30 rounded-lg" />
                  <div className="absolute top-6 left-6 w-8 h-8 border-primary rounded-tl-lg" style={{borderTopWidth: 3, borderLeftWidth: 3}} />
                  <div className="absolute top-6 right-6 w-8 h-8 border-primary rounded-tr-lg" style={{borderTopWidth: 3, borderRightWidth: 3}} />
                  <div className="absolute bottom-6 left-6 w-8 h-8 border-primary rounded-bl-lg" style={{borderBottomWidth: 3, borderLeftWidth: 3}} />
                  <div className="absolute bottom-6 right-6 w-8 h-8 border-primary rounded-br-lg" style={{borderBottomWidth: 3, borderRightWidth: 3}} />
                </>
              )}
            </div>

            {/* ID mode hint */}
            {isIdMode && !scanning && streaming && (
              <div className="absolute top-12 left-0 right-0 flex justify-center pointer-events-none">
                <span className="bg-amber-500/90 text-black text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
                  <CreditCard className="h-3.5 w-3.5" />
                  Place {idSideLabel} of ID in the card frame
                </span>
              </div>
            )}

            {/* Scanning animation */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-0 right-0 top-0" style={{ height: `${scanProgress * 100}%`, background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)" }} />
                <div className="absolute left-0 right-0 bottom-0" style={{ height: `${(1 - scanProgress) * 100}%`, background: "rgba(0,0,0,0.35)" }} />
                <div className="absolute left-0 right-0 h-1" style={{ top: `${scanProgress * 100}%`, boxShadow: "0 0 20px 6px hsl(var(--primary) / 0.7), 0 0 40px 12px hsl(var(--primary) / 0.3)", background: `linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 15%, hsl(45 80% 70%) 50%, hsl(var(--primary)) 85%, transparent 100%)` }} />
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <span className="text-white text-sm font-medium bg-black/60 px-3 py-1 rounded-full">
                    Scanning {isIdMode ? idSideLabel : "document"}… {Math.round(scanProgress * 100)}%
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
          <div className="relative">
            <img src={captured} alt="Captured" className={`max-w-full max-h-full object-contain ${aiCleaning ? "opacity-50" : ""}`} />
            {aiCleaning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Sparkles className="h-10 w-10 text-primary animate-pulse" />
                <p className="text-white text-sm font-medium mt-2 bg-black/60 px-3 py-1 rounded-full">AI cleaning document...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black/80 backdrop-blur-sm px-4 py-3 safe-area-bottom">
        {!captured ? (
          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="icon" onClick={switchCamera} className="text-white/70 hover:text-white hover:bg-white/10 h-12 w-12" title="Switch camera">
              <RotateCcw className="h-5 w-5" />
            </Button>

            {torchSupported && (
              <Button variant="ghost" size="icon" onClick={toggleTorch} className={`h-12 w-12 ${torchOn ? "text-yellow-400 bg-yellow-400/20" : "text-white/70 hover:text-white hover:bg-white/10"}`} title={torchOn ? "Turn off flashlight" : "Turn on flashlight"}>
                {torchOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
              </Button>
            )}

            {!isIdMode && (
              <Button onClick={takePhoto} disabled={!streaming || scanning} className="brass-gradient text-primary-foreground h-16 w-16 rounded-full hover:opacity-90" title="Take photo">
                <Camera className="h-6 w-6" />
              </Button>
            )}

            {isIdMode ? (
              <Button
                onClick={() => scanIdSide(scanMode === "id-front" ? "front" : "back")}
                disabled={!streaming || scanning}
                className="h-14 rounded-full brass-gradient text-primary-foreground hover:opacity-90 px-6 text-sm font-bold gap-2"
              >
                <ScanLine className="h-5 w-5" />
                Scan {idSideLabel}
              </Button>
            ) : (
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
            )}
          </div>
        ) : (
          <div className="space-y-2 max-w-sm mx-auto">
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!captured) return;
                  setAiCleaning(true);
                  toast.info("AI is re-cleaning your scan...");
                  try {
                    const { data, error } = await supabase.functions.invoke("clean-scan", { body: { image: captured } });
                    if (error) throw error;
                    if (data?.cleanedImage) {
                      setCaptured(data.cleanedImage);
                      toast.success("Document re-cleaned!");
                    }
                  } catch { toast.error("AI cleaning failed"); }
                  finally { setAiCleaning(false); }
                }}
                disabled={aiCleaning}
                variant="outline"
                className="flex-1 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Clean
              </Button>
              <Button onClick={saveAsImage} disabled={aiCleaning} className="flex-1 brass-gradient text-primary-foreground hover:opacity-90">
                <ImageIcon className="h-4 w-4 mr-2" />
                Save Photo
              </Button>
              <Button onClick={saveAsDocument} disabled={aiCleaning} className="flex-1 brass-gradient text-primary-foreground hover:opacity-90">
                <FileText className="h-4 w-4 mr-2" />
                Save as PDF
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" disabled={aiCleaning} onClick={() => { setCaptured(null); startCamera(facingMode); }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" disabled={aiCleaning} onClick={handleClose}>
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
