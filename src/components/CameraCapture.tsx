import { useState, useRef, useCallback, useEffect } from "react";
import { useAdPrefetch } from "@/hooks/useAdPrefetch";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, X, FileText, Image as ImageIcon, Smartphone, Monitor, Flashlight, FlashlightOff, CreditCard, ScanLine, ArrowRight, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { enhanceScanCanvas } from "@/lib/enhanceScan";
import { downloadBlob } from "@/lib/downloadFile";
import { triggerNativeAd, isAndroidWebView } from "@/lib/nativeAd";
import { detectDocumentCorners, warpDocument, estimateOutputSize, type Quad } from "@/lib/documentProcessor";
import ManualCropScreen from "@/components/ManualCropScreen";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onScanStart?: () => void;
}

type ScanMode = "select" | "document" | "photo" | "photo-crop" | "id-front" | "id-back" | "id-preview" | "id-layout";


interface IdPlacement { xMm: number; yMm: number; widthMm: number; }
interface FrameRect { x: number; y: number; width: number; height: number; }
const ID_ASPECT = 85.6 / 53.98; // width / height
const A4_W_MM = 210;
const A4_H_MM = 297;
const A4_PORTRAIT_ASPECT = A4_W_MM / A4_H_MM;
const A4_LANDSCAPE_ASPECT = A4_H_MM / A4_W_MM;
const DEFAULT_ID_WIDTH_MM = 110;
const BANNER_SAFE_BOTTOM = "calc(104px + env(safe-area-inset-bottom, 0px))";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> => {
  if (!canvas.toBlob) {
    return fetch(canvas.toDataURL(type, quality)).then((r) => r.blob());
  }
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else fetch(canvas.toDataURL(type, quality)).then((r) => r.blob()).then(resolve);
      },
      type,
      quality
    );
  });
};

const downscaleCanvas = (canvas: HTMLCanvasElement, maxDimension: number) => {
  const scale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * scale));
  small.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = small.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small;
};

const canvasToDataUrlBlob = async (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> => {
  const dataUrl = canvas.toDataURL(type, quality);
  return fetch(dataUrl).then((r) => r.blob());
};

const canvasToBlobQuick = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
  timeoutMs: number,
  fallbackMaxDimension: number
): Promise<Blob> => {
  return new Promise((resolve) => {
    let settled = false;
    let fallbackStarted = false;
    const finish = (blob: Blob) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };

    const runFallback = async () => {
      if (settled || fallbackStarted) return;
      fallbackStarted = true;
      const small = downscaleCanvas(canvas, fallbackMaxDimension);
      finish(await canvasToDataUrlBlob(small, type, Math.min(quality, 0.84)));
    };

    if (!canvas.toBlob) {
      void runFallback();
      return;
    }

    canvas.toBlob((blob) => {
      if (blob) finish(blob);
      else void runFallback();
    }, type, quality);

    window.setTimeout(async () => {
      if (settled) return;
      try { await runFallback(); }
      catch { finish(await canvasToBlob(canvas, type, Math.min(quality, 0.8))); }
    }, timeoutMs);
  });
};

const canvasToFile = async (
  canvas: HTMLCanvasElement,
  filename: string,
  type: string,
  quality: number,
  options?: { timeoutMs?: number; fallbackMaxDimension?: number }
): Promise<File> => {
  const blob = options?.timeoutMs && options?.fallbackMaxDimension
    ? await canvasToBlobQuick(canvas, type, quality, options.timeoutMs, options.fallbackMaxDimension)
    : await canvasToBlob(canvas, type, quality);
  return new File([blob], filename, { type, lastModified: Date.now() });
};

const getAndroidMajor = () => {
  const match = (navigator.userAgent || "").match(/Android\s+(\d+)/i);
  return match ? Number(match[1]) : null;
};

const getCenteredFrame = (displayW: number, displayH: number, aspect: number, widthRatio: number, heightRatio: number, maxWidth: number): FrameRect => {
  const safeW = Math.max(1, displayW);
  const safeH = Math.max(1, displayH);
  let width = Math.min(safeW * widthRatio, maxWidth, safeH * heightRatio * aspect);
  let height = width / aspect;
  if (height > safeH * heightRatio) {
    height = safeH * heightRatio;
    width = height * aspect;
  }
  return {
    x: (safeW - width) / 2,
    y: (safeH - height) / 2,
    width,
    height,
  };
};

const getObjectCoverSourceRect = (
  videoW: number,
  videoH: number,
  displayW: number,
  displayH: number
) => {
  const sourcePerCssPixel = Math.min(videoW / Math.max(1, displayW), videoH / Math.max(1, displayH));
  const visibleW = Math.min(videoW, displayW * sourcePerCssPixel);
  const visibleH = Math.min(videoH, displayH * sourcePerCssPixel);
  return {
    sourcePerCssPixel,
    offsetX: Math.max(0, (videoW - visibleW) / 2),
    offsetY: Math.max(0, (videoH - visibleH) / 2),
    visibleW,
    visibleH,
  };
};

const expandSourceRect = (
  x: number,
  y: number,
  width: number,
  height: number,
  maxW: number,
  maxH: number,
  ratio: number
) => {
  const pad = Math.min(width, height) * ratio;
  const nextX = Math.max(0, x - pad);
  const nextY = Math.max(0, y - pad);
  const nextRight = Math.min(maxW, x + width + pad);
  const nextBottom = Math.min(maxH, y + height + pad);
  return { x: nextX, y: nextY, width: nextRight - nextX, height: nextBottom - nextY };
};

const getDocumentFrame = (displayW: number, displayH: number, orientation: "portrait" | "landscape") => {
  const landscape = orientation === "landscape";
  return getCenteredFrame(
    displayW,
    displayH,
    landscape ? A4_LANDSCAPE_ASPECT : A4_PORTRAIT_ASPECT,
    landscape ? 0.92 : 0.90,
    landscape ? 0.65 : 0.80,
    landscape ? 760 : 640
  );
};

const getIdFrame = (displayW: number, displayH: number) =>
  getCenteredFrame(displayW, displayH, ID_ASPECT, 0.88, 0.48, 540);

const clampPlacement = (p: IdPlacement): IdPlacement => {
  const minW = 40;
  const maxW = A4_W_MM - 10;
  const widthMm = Math.max(minW, Math.min(maxW, p.widthMm));
  const heightMm = widthMm / ID_ASPECT;
  const xMm = Math.max(0, Math.min(A4_W_MM - widthMm, p.xMm));
  const yMm = Math.max(0, Math.min(A4_H_MM - heightMm, p.yMm));
  return { xMm, yMm, widthMm };
};

const getCaptureProfile = () => {
  const rawMemory = (navigator as any).deviceMemory;
  const memory = typeof rawMemory === "number" ? rawMemory : isAndroidWebView() ? 3 : 4;
  const cores = navigator.hardwareConcurrency || 4;
  const androidMajor = getAndroidMajor();
  const olderAndroid = !!androidMajor && androidMajor <= 10;
  const webView = isAndroidWebView();
  const lowEnd = memory <= 2 || cores <= 4 || olderAndroid;
  const midRange = lowEnd || memory <= 4 || cores <= 6 || webView;
  return {
    lowEnd,
    midRange,
    photoMax: lowEnd ? 1280 : midRange ? 1800 : 2400,
    documentMax: lowEnd ? 1280 : midRange ? 1800 : 2400,
    idMax: lowEnd ? 1100 : midRange ? 1400 : 1800,
    documentQuality: lowEnd ? 0.86 : midRange ? 0.9 : 0.94,
    photoQuality: lowEnd ? 0.86 : midRange ? 0.9 : 0.94,
    idQuality: lowEnd ? 0.86 : midRange ? 0.9 : 0.93,
    backgroundScale: lowEnd ? 0.04 : midRange ? 0.05 : 0.08,
    sweepMs: lowEnd ? 180 : midRange ? 240 : 360,
    encodeTimeoutMs: lowEnd ? 120 : midRange ? 220 : 650,
    fallbackMax: lowEnd ? 1100 : midRange ? 1400 : 1800,
    // On low-end phones the full enhance pass can freeze the UI thread
    // for many seconds — skip the heavy shadow removal / unsharp mask
    // so capture returns the instant the sweep animation finishes.
    fastEnhance: lowEnd || webView,
  };
};

const qualityLabel = (score: number) => {
  if (score >= 90) return { label: "Best scan", tone: "text-emerald-300 bg-emerald-500/20 border-emerald-400/40" };
  if (score >= 60) return { label: "Good scan", tone: "text-lime-300 bg-lime-500/20 border-lime-400/40" };
  if (score >= 50) return { label: "Not yet accurate", tone: "text-amber-300 bg-amber-500/20 border-amber-400/40" };
  return { label: "Poor scan", tone: "text-red-300 bg-red-500/20 border-red-400/40" };
};

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
  const [scanStatusText, setScanStatusText] = useState("Scanning document");
  const [photoCapturing, setPhotoCapturing] = useState(false);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [saveChoicesOpen, setSaveChoicesOpen] = useState<null | "capture" | "id">(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Instant-feedback capture flash (300ms) + optional frozen frame preview.
  const [flashKey, setFlashKey] = useState(0);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const frozenObjectUrlRef = useRef<string | null>(null);

  // Photo mode: raw color capture handed to the manual crop screen.
  const [photoRawUrl, setPhotoRawUrl] = useState<string | null>(null);
  const photoRawObjectUrlRef = useRef<string | null>(null);

  // Live auto-scan: 4-corner detection running in the worker.
  const [liveCorners, setLiveCorners] = useState<Quad | null>(null);
  const [liveConfidence, setLiveConfidence] = useState(0);
  const stableCornersRef = useRef<{ corners: Quad | null; count: number; lastFireAt: number }>({
    corners: null,
    count: 0,
    lastFireAt: 0,
  });
  const autoFireInFlightRef = useRef(false);

  // ID scanning state
  const [scanMode, setScanMode] = useState<ScanMode>("select");
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);
  const capturedObjectUrlRef = useRef<string | null>(null);
  const idObjectUrlsRef = useRef<string[]>([]);

  // Live scan quality feedback (0-100)
  const [quality, setQuality] = useState(0);
  const [qualityHint, setQualityHint] = useState<string>("Hold steady, fill the frame");
  const qualityCanvasRef = useRef<HTMLCanvasElement | null>(null);


  // ID A4 layout editor state
  const [idLayout, setIdLayout] = useState<{ front: IdPlacement; back: IdPlacement }>({
    front: { xMm: (A4_W_MM - DEFAULT_ID_WIDTH_MM) / 2, yMm: 15, widthMm: DEFAULT_ID_WIDTH_MM },
    back:  { xMm: (A4_W_MM - DEFAULT_ID_WIDTH_MM) / 2, yMm: 15 + DEFAULT_ID_WIDTH_MM / ID_ASPECT + 10, widthMm: DEFAULT_ID_WIDTH_MM },
  });
  const a4ContainerRef = useRef<HTMLDivElement | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreaming(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const clearCapturedPreview = useCallback(() => {
    if (capturedObjectUrlRef.current) {
      URL.revokeObjectURL(capturedObjectUrlRef.current);
      capturedObjectUrlRef.current = null;
    }
    setCaptured(null);
    setCapturedFile(null);
  }, []);

  const clearIdPreviews = useCallback(() => {
    idObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    idObjectUrlsRef.current = [];
    setIdFrontImage(null);
    setIdBackImage(null);
  }, []);

  const setCapturedPreview = useCallback((file: File) => {
    if (capturedObjectUrlRef.current) URL.revokeObjectURL(capturedObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    capturedObjectUrlRef.current = url;
    setCaptured(url);
    setCapturedFile(file);
  }, []);

  // Pick the best back camera on phones that expose multiple lenses
  // (wide/ultrawide/telephoto/depth). Ultrawide and depth lenses often
  // produce soft, distorted or low-light scans, so we prefer the main wide.
  const pickBestVideoDeviceId = async (facing: "user" | "environment"): Promise<string | undefined> => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return undefined;
      // Permission must already be granted for labels to be populated.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length <= 1) return cams[0]?.deviceId;

      const wantBack = facing === "environment";
      const score = (label: string) => {
        const l = label.toLowerCase();
        let s = 0;
        if (wantBack) {
          if (/back|rear|environment/.test(l)) s += 50;
          if (/front|user|face/.test(l)) s -= 50;
        } else {
          if (/front|user|face/.test(l)) s += 50;
          if (/back|rear|environment/.test(l)) s -= 50;
        }
        // Strongly prefer the main wide lens over ultrawide / tele / depth / mono.
        if (/\bultra[\s-]?wide|0\.5x|wide angle/.test(l)) s -= 40;
        if (/tele|zoom|2x|3x|5x/.test(l)) s -= 30;
        if (/depth|tof|mono|monochrome|infrared|ir\b/.test(l)) s -= 80;
        if (/\bmain\b|\bwide\b|\b1x\b|standard|primary/.test(l)) s += 20;
        // "camera2 0" on Android is usually the main back lens.
        if (wantBack && /\b0\b/.test(l)) s += 5;
        return s;
      };
      const ranked = [...cams].sort((a, b) => score(b.label) - score(a.label));
      return ranked[0]?.deviceId;
    } catch {
      return undefined;
    }
  };

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Try a cascade of constraints, from best quality to most permissive,
      // so we work across iPhone Safari, Android Chrome, Samsung Internet,
      // and in-app WebViews that reject strict constraints.
      const deviceId = await pickBestVideoDeviceId(facing);
      const baseFacing: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: facing } };
      const profile = getCaptureProfile();
      const portraitViewport = typeof window !== "undefined" && window.innerHeight >= window.innerWidth;
      const primaryW = portraitViewport ? 2160 : 3840;
      const primaryH = portraitViewport ? 3840 : 2160;
      const secondaryW = portraitViewport ? 1440 : 1920;
      const secondaryH = portraitViewport ? 1920 : 1080;

      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            ...baseFacing,
            width: { ideal: primaryW },
            height: { ideal: primaryH },
            aspectRatio: { ideal: portraitViewport ? 3 / 4 : 16 / 9 },
            frameRate: { ideal: 30, max: 30 },
            advanced: [
              { focusMode: "continuous" },
              { exposureMode: "continuous" },
              { whiteBalanceMode: "continuous" },
              { resizeMode: "none" },
            ] as any,
          },
          audio: false,
        },
        {
          video: {
            ...baseFacing,
            width: { ideal: primaryW },
            height: { ideal: primaryH },
            aspectRatio: { ideal: portraitViewport ? 3 / 4 : 16 / 9 },
            frameRate: { ideal: 30, max: 30 },
            advanced: [
              { focusMode: "continuous" },
              { exposureMode: "continuous" },
              { whiteBalanceMode: "continuous" },
            ] as any,
          },
          audio: false,
        },
        { video: { ...baseFacing, width: { ideal: secondaryW }, height: { ideal: secondaryH }, aspectRatio: { ideal: portraitViewport ? 3 / 4 : 16 / 9 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
        { video: { ...baseFacing, width: { ideal: 1600 }, height: { ideal: 1200 }, frameRate: { ideal: 30, max: 30 } }, audio: false },
        {
          video: { ...baseFacing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
          audio: false,
        },
        { video: { facingMode: facing }, audio: false },
        { video: true, audio: false },
      ];

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;
      for (const c of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!stream) throw lastErr ?? new Error("Camera unavailable");

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
      setStreaming(true);
      clearCapturedPreview();

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;

      // Apply continuous autofocus / exposure / white balance when supported.
      // Many phones ignore these in the initial constraints but accept them
      // via applyConstraints once the track is live.
      try {
        const advanced: any[] = [];
        if (capabilities?.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
        if (capabilities?.exposureMode?.includes?.("continuous")) advanced.push({ exposureMode: "continuous" });
        if (capabilities?.whiteBalanceMode?.includes?.("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
        if (capabilities?.zoom) advanced.push({ zoom: Math.max(capabilities.zoom.min ?? 1, 1) });
        if (advanced.length) await (track as any).applyConstraints({ advanced });
      } catch { /* ignore — best effort */ }

      setTorchSupported(!!capabilities?.torch);
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, [clearCapturedPreview]);


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
      clearIdPreviews();
    } else {
      stopCamera();
      clearCapturedPreview();
      setScanning(false);
      setScanProgress(0);
      setPhotoCapturing(false);
      setSaveChoicesOpen(null);
      setScanMode("select");
      clearIdPreviews();
    }
  }, [open, clearCapturedPreview, clearIdPreviews]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Live quality monitor — samples the video feed periodically and scores
  // sharpness, brightness and edge symmetry to guide the user.
  useEffect(() => {
    if (!open || !streaming || scanning || photoCapturing || captured) {
      setQuality(0);
      return;
    }
    if (!qualityCanvasRef.current) qualityCanvasRef.current = document.createElement("canvas");
    const sampleCanvas = qualityCanvasRef.current;
    const SAMPLE_W = 64, SAMPLE_H = 48;
    sampleCanvas.width = SAMPLE_W;
    sampleCanvas.height = SAMPLE_H;
    const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      try {
        ctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
        const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
        // Grayscale buffer
        const gray = new Float32Array(SAMPLE_W * SAMPLE_H);
        let sum = 0;
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          gray[j] = g;
          sum += g;
        }
        const mean = sum / gray.length;
        // Stdev (contrast)
        let varSum = 0;
        for (let j = 0; j < gray.length; j++) varSum += (gray[j] - mean) ** 2;
        const stdev = Math.sqrt(varSum / gray.length);

        // Laplacian variance (sharpness)
        let lapSum = 0, lapSqSum = 0, lapN = 0;
        // Horizontal/vertical gradient sums for tilt symmetry
        let leftEdge = 0, rightEdge = 0, topEdge = 0, bottomEdge = 0;
        for (let y = 1; y < SAMPLE_H - 1; y++) {
          for (let x = 1; x < SAMPLE_W - 1; x++) {
            const i = y * SAMPLE_W + x;
            const lap = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - SAMPLE_W] + gray[i + SAMPLE_W];
            lapSum += lap;
            lapSqSum += lap * lap;
            lapN++;
            const gx = Math.abs(gray[i + 1] - gray[i - 1]);
            const gy = Math.abs(gray[i + SAMPLE_W] - gray[i - SAMPLE_W]);
            if (x < SAMPLE_W * 0.15) leftEdge += gx;
            else if (x > SAMPLE_W * 0.85) rightEdge += gx;
            if (y < SAMPLE_H * 0.15) topEdge += gy;
            else if (y > SAMPLE_H * 0.85) bottomEdge += gy;
          }
        }
        const lapMean = lapSum / lapN;
        const lapVar = lapSqSum / lapN - lapMean * lapMean;

        // Score components
        const sharpScore = Math.min(100, (lapVar / 90) * 100); // tuned
        const brightScore = mean < 40 ? (mean / 40) * 60 : mean > 215 ? Math.max(0, 100 - (mean - 215) * 4) : 100;
        const contrastScore = Math.min(100, (stdev / 55) * 100);
        const hSym = 1 - Math.abs(leftEdge - rightEdge) / (leftEdge + rightEdge + 1);
        const vSym = 1 - Math.abs(topEdge - bottomEdge) / (topEdge + bottomEdge + 1);
        const alignScore = ((hSym + vSym) / 2) * 100;

        const score = Math.round(
          sharpScore * 0.4 + contrastScore * 0.2 + brightScore * 0.2 + alignScore * 0.2
        );
        const clamped = Math.max(5, Math.min(100, score));
        setQuality(clamped);

        // Hint
        let hint = "Looks great — hold still";
        if (mean < 60) hint = "Too dark — turn on the flashlight or move to better light";
        else if (mean > 215) hint = "Too bright — reduce glare or shadow";
        else if (sharpScore < 35) hint = "Blurry — hold the phone steady and tap to focus";
        else if (contrastScore < 30) hint = "Move closer so the document fills the frame";
        else if (alignScore < 55) hint = "Straighten the phone — keep it parallel to the page";
        else if (clamped < 60) hint = "Almost there — adjust angle slightly";
        setQualityHint(hint);
      } catch {
        // ignore frame errors
      }
    };

    const id = window.setInterval(tick, 1200);
    tick();
    return () => { cancelled = true; window.clearInterval(id); };
  }, [open, streaming, scanning, photoCapturing, captured, scanMode]);


  // Drive the scan-line animation from 0 → 1 over `durationMs`. Heavy
  // enhancement work is kicked off on the very next frame and runs in
  // parallel with the sweep; the promise resolves when BOTH complete.
  // On fast phones the capture finishes the instant the sweep does — a
  // true "blink of an eye" scan.
  const runScanAnimation = (durationMs: number, work: () => void): Promise<void> => {
    return new Promise((resolve) => {
      const start = performance.now();
      let workDone = false;
      requestAnimationFrame(() => {
        try { work(); } catch { /* keep raw scan */ }
        workDone = true;
      });
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        setScanProgress(t);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          if (!workDone) { try { work(); } catch {} }
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  };

  // Instant-feedback flash: freezes the current video frame visually and
  // triggers a hardware-accelerated 300ms shutter animation. Returns the
  // frozen JPEG blob URL so the caller can hold the freeze until decoding
  // finishes.
  const fireCaptureFlash = (): { frozenUrl: string | null } => {
    setFlashKey((k) => k + 1);
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return { frozenUrl: null };
      const displayW = video.clientWidth || video.videoWidth;
      const displayH = video.clientHeight || video.videoHeight;
      const visible = getObjectCoverSourceRect(video.videoWidth, video.videoHeight, displayW, displayH);
      // Small freeze frame — just for the visual freeze, not for saving.
      const freezeMax = 720;
      const scale = Math.min(1, freezeMax / Math.max(visible.visibleW, visible.visibleH));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(visible.visibleW * scale));
      c.height = Math.max(1, Math.round(visible.visibleH * scale));
      const ctx = c.getContext("2d");
      if (!ctx) return { frozenUrl: null };
      ctx.drawImage(video, visible.offsetX, visible.offsetY, visible.visibleW, visible.visibleH, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.7);
      if (frozenObjectUrlRef.current && frozenObjectUrlRef.current.startsWith("blob:")) {
        try { URL.revokeObjectURL(frozenObjectUrlRef.current); } catch { /* ignore */ }
      }
      frozenObjectUrlRef.current = url;
      setFrozenFrame(url);
      return { frozenUrl: url };
    } catch {
      return { frozenUrl: null };
    }
  };

  const clearFrozenFrame = useCallback(() => {
    if (frozenObjectUrlRef.current && frozenObjectUrlRef.current.startsWith("blob:")) {
      try { URL.revokeObjectURL(frozenObjectUrlRef.current); } catch { /* ignore */ }
    }
    frozenObjectUrlRef.current = null;
    setFrozenFrame(null);
  }, []);

  const clearPhotoRaw = useCallback(() => {
    if (photoRawObjectUrlRef.current) {
      try { URL.revokeObjectURL(photoRawObjectUrlRef.current); } catch { /* ignore */ }
    }
    photoRawObjectUrlRef.current = null;
    setPhotoRawUrl(null);
  }, []);

  // Manual "Take Photo" — capture full-color frame at highest resolution,
  // then route to the manual crop adjuster screen (no automatic
  // thresholding, preserves colors, stamps, and signatures).
  const takePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    onScanStart?.();
    setPhotoCapturing(true);
    // Instant flash before any heavy work.
    fireCaptureFlash();
    try {
      await nextFrame();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const profile = getCaptureProfile();
      const maxDimension = Math.max(profile.photoMax, 2000); // photo mode wants the full crop-adjust area
      const sourceW = video.videoWidth || 1280;
      const sourceH = video.videoHeight || 720;
      const displayW = video.clientWidth || sourceW;
      const displayH = video.clientHeight || sourceH;
      const visible = getObjectCoverSourceRect(sourceW, sourceH, displayW, displayH);
      const scale = Math.min(1, maxDimension / Math.max(visible.visibleW, visible.visibleH));
      canvas.width = Math.max(1, Math.round(visible.visibleW * scale));
      canvas.height = Math.max(1, Math.round(visible.visibleH * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, visible.offsetX, visible.offsetY, visible.visibleW, visible.visibleH, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlobQuick(canvas, "image/jpeg", profile.photoQuality, profile.encodeTimeoutMs, profile.fallbackMax);
      if (photoRawObjectUrlRef.current) {
        try { URL.revokeObjectURL(photoRawObjectUrlRef.current); } catch { /* ignore */ }
      }
      const url = URL.createObjectURL(blob);
      photoRawObjectUrlRef.current = url;
      setPhotoRawUrl(url);
      stopCamera();
      setScanMode("photo-crop");
      clearFrozenFrame();
    } catch {
      toast.error("Could not capture photo on this device");
      clearFrozenFrame();
    } finally {
      setPhotoCapturing(false);
    }
  };


  const performScan = async (): Promise<File | null> => {
    if (!videoRef.current || !canvasRef.current || !scanCanvasRef.current) return null;
    onScanStart?.();
    setScanStatusText(`Scanning ${scanMode === "id-front" ? "ID front" : scanMode === "id-back" ? "ID back" : "document"}`);
    setScanning(true);
    setScanProgress(0);
    // Instant capture flash for high-speed feedback.
    fireCaptureFlash();
    await nextFrame();


    const video = videoRef.current;
    const scanCanvas = scanCanvasRef.current;
    const mainCanvas = canvasRef.current;

    const videoEl = videoRef.current;
    const displayW = videoEl.clientWidth;
    const displayH = videoEl.clientHeight;
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;

    const visible = getObjectCoverSourceRect(videoW, videoH, displayW, displayH);

    const isIdScan = scanMode === "id-front" || scanMode === "id-back";

    let cropX: number, cropY: number, cropW: number, cropH: number;

    if (isIdScan) {
      const frame = getIdFrame(displayW, displayH);
      cropX = visible.offsetX + frame.x * visible.sourcePerCssPixel;
      cropY = visible.offsetY + frame.y * visible.sourcePerCssPixel;
      cropW = frame.width * visible.sourcePerCssPixel;
      cropH = frame.height * visible.sourcePerCssPixel;
    } else {
      const frame = getDocumentFrame(displayW, displayH, scanOrientation);
      cropX = visible.offsetX + frame.x * visible.sourcePerCssPixel;
      cropY = visible.offsetY + frame.y * visible.sourcePerCssPixel;
      cropW = frame.width * visible.sourcePerCssPixel;
      cropH = frame.height * visible.sourcePerCssPixel;
    }

    const expanded = expandSourceRect(cropX, cropY, cropW, cropH, videoW, videoH, isIdScan ? 0.025 : 0.035);
    cropX = expanded.x;
    cropY = expanded.y;
    cropW = expanded.width;
    cropH = expanded.height;

    // Higher caps restore the crisp look of the previous scans.
    let targetW = cropW;
    let targetH = cropH;
    const profile = getCaptureProfile();
    const maxDimension = isIdScan ? profile.idMax : profile.documentMax;
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
    if (!scanCtx) {
      setScanning(false);
      setScanProgress(0);
      return null;
    }

    scanCtx.imageSmoothingEnabled = true;
    scanCtx.imageSmoothingQuality = "high";
    // Freeze the frame immediately so any subsequent hand shake doesn't matter.
    scanCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    const mainCtx = mainCanvas.getContext("2d");
    if (mainCtx) {
      mainCtx.imageSmoothingEnabled = true;
      mainCtx.imageSmoothingQuality = "high";
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

    const jpegQuality = isIdScan ? profile.idQuality : profile.documentQuality;
    const prefix = isIdScan ? "id_scan_side" : "scan_image";
    let filePromise: Promise<File> | null = null;

    // For full-document scans, offload perspective warp + adaptive
    // thresholding to the web worker so the main thread stays smooth.
    // If corner detection is confident, we replace mainCanvas with the
    // warped, flattened result BEFORE the enhance pass runs.
    let workerWarped = false;
    if (!isIdScan && mainCtx) {
      try {
        const scanImageData = scanCtx.getImageData(0, 0, targetW, targetH);
        const detection = await Promise.race([
          detectDocumentCorners(scanImageData),
          new Promise<{ corners: null; confidence: number }>((resolve) =>
            setTimeout(() => resolve({ corners: null, confidence: 0 }), 800)
          ),
        ]);
        if (detection.corners && detection.confidence >= 0.42) {
          // Second copy since transferable moved the first.
          const scanImageData2 = scanCtx.getImageData(0, 0, targetW, targetH);
          const outSize = estimateOutputSize(detection.corners, Math.max(targetW, targetH));
          const warped = await Promise.race([
            warpDocument(scanImageData2, detection.corners, outSize.outW, outSize.outH, { adaptiveThreshold: true }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
          ]);
          if (warped) {
            mainCanvas.width = warped.width;
            mainCanvas.height = warped.height;
            mainCtx.putImageData(warped, 0, 0);
            workerWarped = true;
          }
        }
      } catch (err) {
        // Fall through to the existing enhance path.
        console.debug("Worker warp skipped:", err);
      }
    }

    // Enhancement and JPEG encoding start during the first sweep frame so
    // older WebViews do not sit on the camera screen after the animation ends.
    await runScanAnimation(isIdScan ? 300 : profile.sweepMs, () => {
      if (!workerWarped) {
        enhanceScanCanvas(mainCanvas, { isIdScan, fast: profile.fastEnhance, backgroundScale: profile.backgroundScale });
      }
      filePromise = canvasToFile(mainCanvas, `${prefix}_${Date.now()}.jpg`, "image/jpeg", jpegQuality, {
        timeoutMs: profile.encodeTimeoutMs,
        fallbackMaxDimension: profile.fallbackMax,
      });
    });


    const file = await (filePromise ?? canvasToFile(mainCanvas, `${prefix}_${Date.now()}.jpg`, "image/jpeg", jpegQuality, {
      timeoutMs: profile.encodeTimeoutMs,
      fallbackMaxDimension: profile.fallbackMax,
    }));
    stopCamera();
    setScanning(false);
    setScanProgress(0);

    return file;
  };

  const scanDocument = async () => {
    // Give instant visual feedback before the (sync) crop math runs.
    setScanning(true);
    setScanProgress(0);
    await nextFrame();
    try {
      const result = await performScan();
      if (result) {
        setCapturedPreview(result);
      }
    } catch {
      toast.error("Could not scan on this device");
    } finally {
      setScanning(false);
      setScanProgress(0);
    }
  };

  // ID scanning functions
  const scanIdSide = async (side: "front" | "back") => {
    setScanning(true);
    setScanProgress(0);
    await nextFrame();
    let result: File | null = null;
    try {
      result = await performScan();
    } catch {
      toast.error("Could not scan this ID side");
    }
    if (!result) {
      setScanning(false);
      setScanProgress(0);
      return;
    }

    if (side === "front") {
      const url = URL.createObjectURL(result);
      idObjectUrlsRef.current.push(url);
      setIdFrontImage(url);
      setScanMode("id-back");
      // Restart camera for back side
      setTimeout(() => startCamera(facingMode), 300);
    } else {
      const url = URL.createObjectURL(result);
      idObjectUrlsRef.current.push(url);
      setIdBackImage(url);
      // Reset placements to defaults each time both sides are freshly captured
      setIdLayout({
        front: { xMm: (A4_W_MM - DEFAULT_ID_WIDTH_MM) / 2, yMm: 15, widthMm: DEFAULT_ID_WIDTH_MM },
        back:  { xMm: (A4_W_MM - DEFAULT_ID_WIDTH_MM) / 2, yMm: 15 + DEFAULT_ID_WIDTH_MM / ID_ASPECT + 10, widthMm: DEFAULT_ID_WIDTH_MM },
      });
      setScanMode("id-layout");
    }
  };

  // Decode a data URL into an ImageBitmap (much faster than new Image()).
  const decodeImage = async (dataUrl: string): Promise<ImageBitmap | HTMLImageElement> => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    } catch {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });
    }
  };

  const combineIdSides = async (): Promise<string | null> => {
    if (!idFrontImage || !idBackImage) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const PX_PER_MM = 1240 / A4_W_MM; // ≈ 200 DPI
    const canvasW = 1240;
    const canvasH = Math.round(A4_H_MM * PX_PER_MM);
    canvas.width = canvasW;
    canvas.height = canvasH;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    const drawPlacement = (img: ImageBitmap | HTMLImageElement, p: IdPlacement) => {
      const x = Math.round(p.xMm * PX_PER_MM);
      const y = Math.round(p.yMm * PX_PER_MM);
      const w = Math.round(p.widthMm * PX_PER_MM);
      const h = Math.round((p.widthMm / ID_ASPECT) * PX_PER_MM);
      ctx.drawImage(img as CanvasImageSource, x, y, w, h);
      ctx.strokeStyle = "#d0d0d0";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };

    const [frontImg, backImg] = await Promise.all([
      decodeImage(idFrontImage),
      decodeImage(idBackImage),
    ]);
    drawPlacement(frontImg, idLayout.front);
    drawPlacement(backImg, idLayout.back);
    return canvas.toDataURL("image/jpeg", 0.85);
  };


  const saveIdAsPdf = async () => {
    try {
      const combined = await combineIdSides();
      if (!combined) return;

      // Composite was rendered at exact A4 size — map 1:1 to the PDF page.
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: false });
      const pageW = pdf.internal.pageSize.getWidth();   // 210
      const pageH = pdf.internal.pageSize.getHeight();  // 297
      pdf.addImage(combined, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
      const pdfBlob = pdf.output("blob");
      const pdfFile = new File([pdfBlob], `id_scan_${Date.now()}.pdf`, { type: "application/pdf" });
      onCapture(pdfFile);
      toast.success("ID scanned and saved as PDF!");
      handleClose();
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
    if (!capturedFile) return;
    const file = capturedFile;
    onCapture(file);
    handleClose();
  };

  // Save the captured photo directly to the user's phone (download manager
  // / file picker / native bridge), bypassing the in-app vault flow.
  const savePhotoToPhone = async () => {
    if (!capturedFile) return;
    const tid = toast.loading("Saving to your phone…");
    try {
      await downloadBlob(capturedFile, capturedFile.name);
      toast.success("File saved successfully", { id: tid });
      // Ad fires ONLY after the save has completed — clean post-task transition.
      triggerNativeAd("scan-save-phone");
      handleClose();
    } catch (e: any) {
      if (e?.name === "AbortError") toast.dismiss(tid);
      else toast.error("Could not save to phone", { id: tid });
    }
  };


  const savePdfToPhone = async () => {
    if (!captured || !capturedFile) return;
    const tid = toast.loading("Preparing PDF…");
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = captured;
      });
      const pdf = new jsPDF({
        orientation: scanOrientation === "landscape" ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
        compress: false,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 5;
      const ratio = Math.min((pageWidth - margin * 2) / img.width, (pageHeight - margin * 2) / img.height);
      const sw = img.width * ratio;
      const sh = img.height * ratio;
      const format = capturedFile.type.includes("png") ? "PNG" : "JPEG";
      pdf.addImage(img, format, (pageWidth - sw) / 2, (pageHeight - sh) / 2, sw, sh, undefined, "FAST");
      const blob = pdf.output("blob");
      await downloadBlob(blob, `scan_${Date.now()}.pdf`);
      toast.success("PDF saved successfully", { id: tid });
      // Ad fires ONLY after the PDF save has completed.
      triggerNativeAd("scan-save-phone");
      handleClose();
    } catch (e: any) {
      if (e?.name === "AbortError") toast.dismiss(tid);
      else toast.error("Could not save PDF to phone", { id: tid });
    }
  };


  const saveAsDocument = () => {
    if (!captured || !capturedFile) return;
    try {
      const img = new Image();
      img.onload = () => {
        const pdf = new jsPDF({
          orientation: scanOrientation === "landscape" ? "landscape" : "portrait",
          unit: "mm",
          format: "a4",
          compress: false,
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
        const format = capturedFile.type.includes("png") ? "PNG" : "JPEG";
        pdf.addImage(img, format, xOffset, yOffset, scaledWidth, scaledHeight, undefined, "FAST");
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

  // Save the assembled two-sided ID directly to the user's phone.
  const saveIdToPhone = async (asPdf: boolean) => {
    const tid = toast.loading("Saving ID to your phone…");
    try {
      const combined = await combineIdSides();
      if (!combined) { toast.dismiss(tid); return; }
      if (asPdf) {
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: false });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.addImage(combined, "JPEG", 0, 0, pageW, pageH, undefined, "FAST");
        const blob = pdf.output("blob");
        await downloadBlob(blob, `id_scan_${Date.now()}.pdf`);
      } else {
        const file = dataUrlToFile(combined, `id_scan_${Date.now()}.jpg`, "image/jpeg");
        await downloadBlob(file, file.name);
      }
      toast.success("ID saved successfully", { id: tid });
      // Ad fires ONLY after the ID has been saved successfully.
      triggerNativeAd("scan-save-phone");
      handleClose();
    } catch (e: any) {
      if (e?.name === "AbortError") toast.dismiss(tid);
      else toast.error("Could not save to phone", { id: tid });
    }
  };


  const handleClose = () => {
    stopCamera();
    clearCapturedPreview();
    setScanning(false);
    setScanProgress(0);
    setPhotoCapturing(false);
    setSaveChoicesOpen(null);
    setScanMode("select");
    clearIdPreviews();
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

  const renderSaveChoices = (kind: "capture" | "id") => (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 px-4" onClick={() => setSaveChoicesOpen(null)}>
      <div
        className="w-full max-w-sm rounded-t-2xl border border-white/15 bg-black/95 p-4 shadow-2xl"
        style={{ marginBottom: BANNER_SAFE_BOTTOM }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3">
          <h4 className="text-sm font-semibold text-white">Save file</h4>
          <Button size="icon" variant="ghost" onClick={() => setSaveChoicesOpen(null)} className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={kind === "id" ? saveIdAsImage : saveAsImage} className="brass-gradient text-primary-foreground hover:opacity-90">
            <ImageIcon className="h-4 w-4 mr-2" />
            Vault Photo
          </Button>
          <Button onClick={kind === "id" ? saveIdAsPdf : saveAsDocument} className="brass-gradient text-primary-foreground hover:opacity-90">
            <FileText className="h-4 w-4 mr-2" />
            Vault PDF
          </Button>
          <Button onClick={kind === "id" ? () => saveIdToPhone(false) : savePhotoToPhone} variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent">
            <Download className="h-4 w-4 mr-2" />
            Phone Photo
          </Button>
          <Button onClick={kind === "id" ? () => saveIdToPhone(true) : savePdfToPhone} variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent">
            <Download className="h-4 w-4 mr-2" />
            Phone PDF
          </Button>
        </div>
      </div>
    </div>
  );

  // Mode selection screen
  if (scanMode === "select") {
    const selectOverlay = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingBottom: BANNER_SAFE_BOTTOM }}>

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
  if (scanMode === "id-layout" && idFrontImage && idBackImage) {
    const startDrag = (
      side: "front" | "back",
      mode: "move" | "resize",
      e: React.PointerEvent
    ) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const container = a4ContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mmPerPx = A4_W_MM / rect.width;
      const startX = e.clientX;
      const startY = e.clientY;
      const start = idLayout[side];

      const onMove = (ev: PointerEvent) => {
        const dxMm = (ev.clientX - startX) * mmPerPx;
        const dyMm = (ev.clientY - startY) * mmPerPx;
        setIdLayout((prev) => {
          const next = { ...prev };
          if (mode === "move") {
            next[side] = clampPlacement({ ...start, xMm: start.xMm + dxMm, yMm: start.yMm + dyMm });
          } else {
            // resize from bottom-right, preserve aspect via width
            next[side] = clampPlacement({ ...start, widthMm: start.widthMm + dxMm });
          }
          return next;
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

    const renderCard = (side: "front" | "back") => {
      const p = idLayout[side];
      const heightMm = p.widthMm / ID_ASPECT;
      const src = side === "front" ? idFrontImage : idBackImage;
      return (
        <div
          key={side}
          onPointerDown={(e) => startDrag(side, "move", e)}
          className="absolute touch-none cursor-move select-none rounded-md ring-2 ring-amber-400/70 shadow-lg overflow-hidden"
          style={{
            left: `${(p.xMm / A4_W_MM) * 100}%`,
            top: `${(p.yMm / A4_H_MM) * 100}%`,
            width: `${(p.widthMm / A4_W_MM) * 100}%`,
            height: `${(heightMm / A4_H_MM) * 100}%`,
            background: "#fff",
          }}
        >
          <img src={src!} alt={`ID ${side}`} className="w-full h-full object-fill pointer-events-none" draggable={false} />
          <span className="absolute top-1 left-1 text-[10px] font-bold bg-amber-400 text-black px-1.5 py-0.5 rounded uppercase">
            {side}
          </span>
          {/* Resize handle */}
          <div
            onPointerDown={(e) => startDrag(side, "resize", e)}
            className="absolute bottom-0 right-0 w-6 h-6 bg-amber-400 cursor-nwse-resize touch-none flex items-center justify-center"
            style={{ borderTopLeftRadius: 6 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 10 L10 2 M5 10 L10 5 M8 10 L10 8" stroke="#000" strokeWidth="1.5" fill="none" /></svg>
          </div>
        </div>
      );
    };

    const layoutOverlay = (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingBottom: BANNER_SAFE_BOTTOM }}>

        <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between safe-area-top z-10">
          <h3 className="text-white text-sm font-medium">Arrange on A4 — drag & resize</h3>
          <Button size="icon" variant="ghost" onClick={handleClose} className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto flex flex-col items-center justify-start px-3 py-3 gap-2">
          <p className="text-white/70 text-xs text-center max-w-xs">
            Drag each side to move it. Drag the amber corner to resize. Both copies stay inside the A4 page.
          </p>
          <div
            ref={a4ContainerRef}
            className="relative bg-white shadow-2xl"
            style={{ width: "min(92vw, 420px)", aspectRatio: `${A4_W_MM}/${A4_H_MM}` }}
          >
            {/* faint grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
              backgroundSize: `${100 / 7}% ${100 / 10}%`,
            }} />
            {renderCard("front")}
            {renderCard("back")}
          </div>

          <div className="flex gap-2 mt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-white/30 text-white hover:bg-white/10 bg-transparent"
              onClick={() => setIdLayout({
                front: { xMm: (A4_W_MM - DEFAULT_ID_WIDTH_MM) / 2, yMm: 15, widthMm: DEFAULT_ID_WIDTH_MM },
                back:  { xMm: (A4_W_MM - DEFAULT_ID_WIDTH_MM) / 2, yMm: 15 + DEFAULT_ID_WIDTH_MM / ID_ASPECT + 10, widthMm: DEFAULT_ID_WIDTH_MM },
              })}
            >
              Reset layout
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-white/30 text-white hover:bg-white/10 bg-transparent"
              onClick={() => setIdLayout((p) => ({
                front: clampPlacement({ ...p.front, widthMm: Math.min(A4_W_MM - 10, p.front.widthMm + 10) }),
                back:  clampPlacement({ ...p.back,  widthMm: Math.min(A4_W_MM - 10, p.back.widthMm + 10) }),
              }))}
            >
              Bigger
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-white/30 text-white hover:bg-white/10 bg-transparent"
              onClick={() => setIdLayout((p) => ({
                front: clampPlacement({ ...p.front, widthMm: Math.max(40, p.front.widthMm - 10) }),
                back:  clampPlacement({ ...p.back,  widthMm: Math.max(40, p.back.widthMm - 10) }),
              }))}
            >
              Smaller
            </Button>
          </div>
        </div>

        <div className="bg-black/80 backdrop-blur-sm px-4 py-3 safe-area-bottom">
          <div className="flex items-center gap-2 max-w-sm mx-auto">
            <Button onClick={() => setSaveChoicesOpen("id")} className="flex-[1.4] brass-gradient text-primary-foreground hover:opacity-90">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
              <Button
                variant="ghost"
                className="flex-1 text-white/70 hover:text-white"
                onClick={() => {
                  clearIdPreviews();
                  setScanMode("id-front");
                  startCamera(facingMode);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Rescan
              </Button>
              <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" onClick={handleClose}>
                Cancel
              </Button>
          </div>
        </div>
        {saveChoicesOpen === "id" && renderSaveChoices("id")}
      </div>
    );
    return createPortal(layoutOverlay, document.body);
  }


  // Determine labels for ID scanning
  const isIdMode = scanMode === "id-front" || scanMode === "id-back";
  const idSideLabel = scanMode === "id-front" ? "FRONT side" : "BACK side";
  const documentFrameAspect = scanOrientation === "landscape" ? A4_LANDSCAPE_ASPECT : A4_PORTRAIT_ASPECT;
  const documentFrameWidthCss = "94%";
  const documentFrameMaxWidth = scanOrientation === "landscape" ? "760px" : "640px";

  const overlay = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingBottom: BANNER_SAFE_BOTTOM }}>
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={scanCanvasRef} className="hidden" />

      {/* Top bar */}
      <div className="bg-black/80 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2 safe-area-top z-10">
        <h3 className="text-white text-sm font-medium truncate flex-1">
          {scanning ? "Scanning…" : photoCapturing ? "Capturing…" : captured ? "Preview" : isIdMode ? `Scan ID — ${idSideLabel}` : "Document Scanner"}
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
                  <div className="absolute rounded-xl overflow-hidden" style={{ width: '92%', maxWidth: '540px', aspectRatio: `${ID_ASPECT}/1`, border: '2.5px solid rgba(255,255,255,0.6)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)' }} />
                  <div className="absolute" style={{ width: '92%', maxWidth: '540px', aspectRatio: `${ID_ASPECT}/1` }}>
                    <div className="absolute top-0 left-0 w-8 h-8 border-amber-400 rounded-tl-lg" style={{borderTopWidth: 3, borderLeftWidth: 3}} />
                    <div className="absolute top-0 right-0 w-8 h-8 border-amber-400 rounded-tr-lg" style={{borderTopWidth: 3, borderRightWidth: 3}} />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-amber-400 rounded-bl-lg" style={{borderBottomWidth: 3, borderLeftWidth: 3}} />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-amber-400 rounded-br-lg" style={{borderBottomWidth: 3, borderRightWidth: 3}} />
                  </div>
                </>
              ) : (
                /* Full document frame */
                <>
                  <div
                    className="absolute rounded-lg border-2 border-white/35"
                    style={{
                      width: documentFrameWidthCss,
                      maxWidth: documentFrameMaxWidth,
                      aspectRatio: `${documentFrameAspect}/1`,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                    }}
                  />
                  <div
                    className="absolute"
                    style={{
                      width: documentFrameWidthCss,
                      maxWidth: documentFrameMaxWidth,
                      aspectRatio: `${documentFrameAspect}/1`,
                    }}
                  >
                    <div className="absolute top-0 left-0 w-8 h-8 border-primary rounded-tl-lg" style={{borderTopWidth: 3, borderLeftWidth: 3}} />
                    <div className="absolute top-0 right-0 w-8 h-8 border-primary rounded-tr-lg" style={{borderTopWidth: 3, borderRightWidth: 3}} />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-primary rounded-bl-lg" style={{borderBottomWidth: 3, borderLeftWidth: 3}} />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-primary rounded-br-lg" style={{borderBottomWidth: 3, borderRightWidth: 3}} />
                  </div>
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

            {/* Live scan quality meter */}
            {streaming && !scanning && (() => {
              const q = qualityLabel(quality);
              return (
                <div className="absolute top-2 left-2 right-2 flex flex-col items-center gap-1 pointer-events-none">
                  <div className={`px-3 py-1 rounded-full border text-xs font-bold backdrop-blur-sm flex items-center gap-2 ${q.tone}`}>
                    <span className="tabular-nums">{quality}%</span>
                    <span>{q.label}</span>
                  </div>
                  <div className="w-44 h-1.5 bg-black/50 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-200"
                      style={{
                        width: `${quality}%`,
                        background: quality >= 90 ? "#34d399" : quality >= 60 ? "#a3e635" : quality >= 50 ? "#fbbf24" : "#f87171",
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-white/85 bg-black/55 px-2 py-0.5 rounded-full max-w-[90%] text-center">
                    {qualityHint}
                  </span>
                </div>
              );
            })()}


            {/* Scanning animation */}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-0 right-0 top-0" style={{ height: `${scanProgress * 100}%`, background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)" }} />
                <div className="absolute left-0 right-0 bottom-0" style={{ height: `${(1 - scanProgress) * 100}%`, background: "rgba(0,0,0,0.35)" }} />
                <div className="absolute left-0 right-0 h-1" style={{ top: `${scanProgress * 100}%`, boxShadow: "0 0 20px 6px hsl(var(--primary) / 0.7), 0 0 40px 12px hsl(var(--primary) / 0.3)", background: `linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 15%, hsl(45 80% 70%) 50%, hsl(var(--primary)) 85%, transparent 100%)` }} />
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <span className="text-white text-sm font-medium bg-black/60 px-3 py-1 rounded-full">
                    {scanStatusText}… {scanProgress < 1 ? `${Math.round(scanProgress * 100)}%` : ""}
                  </span>
                </div>
              </div>
            )}

            {photoCapturing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
                <span className="text-white text-sm font-medium bg-black/60 px-3 py-1 rounded-full">
                  Capturing…
                </span>
              </div>
            )}

            {!streaming && !scanning && !photoCapturing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <p className="text-white/60 text-sm">Starting camera...</p>
              </div>
            )}
          </>
        ) : (
          <div className="relative">
            <img src={captured} alt="Captured" className="max-w-full max-h-full object-contain" />
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
                <Button onClick={takePhoto} disabled={!streaming || scanning || photoCapturing} className="brass-gradient text-primary-foreground h-16 w-16 rounded-full hover:opacity-90" title="Take photo">
                <Camera className="h-6 w-6" />
              </Button>
            )}

            {isIdMode ? (
              <Button
                onClick={() => scanIdSide(scanMode === "id-front" ? "front" : "back")}
                disabled={!streaming || scanning || photoCapturing}
                className="h-14 rounded-full brass-gradient text-primary-foreground hover:opacity-90 px-6 text-sm font-bold gap-2"
              >
                <ScanLine className="h-5 w-5" />
                Scan {idSideLabel}
              </Button>
            ) : (
              <Button
                onClick={scanDocument}
                disabled={!streaming || scanning || photoCapturing}
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
          <div className="flex items-center gap-2 max-w-sm mx-auto">
              <Button onClick={() => setSaveChoicesOpen("capture")} className="flex-[1.4] brass-gradient text-primary-foreground hover:opacity-90">
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" onClick={() => { clearCapturedPreview(); setSaveChoicesOpen(null); startCamera(facingMode); }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button variant="ghost" className="flex-1 text-white/70 hover:text-white" onClick={handleClose}>
                Cancel
              </Button>
          </div>
        )}
      </div>
      {saveChoicesOpen === "capture" && renderSaveChoices("capture")}
    </div>
  );

  return createPortal(overlay, document.body);
};

export default CameraCapture;
