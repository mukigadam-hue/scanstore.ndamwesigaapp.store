import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
