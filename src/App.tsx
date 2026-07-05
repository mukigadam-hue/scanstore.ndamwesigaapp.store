import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Locker from "./pages/Locker";
import ResetPassword from "./pages/ResetPassword";
import OpenFile from "./pages/OpenFile";
import ScanScreen from "./pages/ScanScreen";
import ViewerScreen from "./pages/ViewerScreen";
import UtilityHome from "./pages/UtilityHome";
import Privacy from "./pages/Privacy";
import InterstitialAdOverlay from "./components/InterstitialAdOverlay";
import OfflineBanner from "./components/OfflineBanner";
import NotFound from "./pages/NotFound";
import { useEffect, useRef } from "react";
import { showInterstitial, prefetchInterstitial } from "@/lib/ads";
import { triggerNativeAd, isAndroidWebView } from "@/lib/nativeAd";

const queryClient = new QueryClient();

const StartupInterstitial = () => {
  useEffect(() => {
    prefetchInterstitial();
    // Fire-and-forget; user can skip after the countdown.
    showInterstitial("app-open");
  }, []);
  return null;
};

/**
 * Fires the WebViewGold native ad bridge on every SPA route change so the
 * native Android shell can count navigations toward its interstitial
 * threshold and display the real ad. No-op outside the WebView shell.
 */
const RouteChangeAdTrigger = () => {
  const location = useLocation();
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!isAndroidWebView()) return;
    triggerNativeAd(`route:${location.pathname}`);
  }, [location.pathname]);
  return null;
};


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/locker" element={<Locker />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/open" element={<OpenFile />} />
            <Route path="/view" element={<ViewerScreen />} />
            <Route path="/scan" element={<ScanScreen />} />
            <Route path="/utility" element={<UtilityHome />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/privacy-policy" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <InterstitialAdOverlay />
          <OfflineBanner />
          <StartupInterstitial />
          <RouteChangeAdTrigger />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
