import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import InterstitialAdOverlay from "./components/InterstitialAdOverlay";
import OfflineBanner from "./components/OfflineBanner";

// Lazy-load non-landing routes so old / low-end phones parse a much smaller
// initial bundle and don't crash on startup. The landing page (Index) stays
// eager so first paint remains instant.
const Auth = lazy(() => import("./pages/Auth"));
const Locker = lazy(() => import("./pages/Locker"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OpenFile = lazy(() => import("./pages/OpenFile"));
const ScanScreen = lazy(() => import("./pages/ScanScreen"));
const ViewerScreen = lazy(() => import("./pages/ViewerScreen"));
const UtilityHome = lazy(() => import("./pages/UtilityHome"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
    Loading…
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
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
            </Suspense>
            <InterstitialAdOverlay />
            <OfflineBanner />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
