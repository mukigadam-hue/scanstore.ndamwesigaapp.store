import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { KeyRound, Shield, Download, Upload, ScanLine, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import heroCabinet from "@/assets/hero-cabinet.jpg";
import LanguageSelector from "@/components/LanguageSelector";

import { showInterstitial, prefetchInterstitial } from "@/lib/ads";

const Index = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    // Ad Trigger 1: app launch, once per session, only when online.
    if (sessionStorage.getItem("launchAdShown") === "1") return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    sessionStorage.setItem("launchAdShown", "1");
    prefetchInterstitial();
    // Small delay so the host overlay registers first.
    const t = setTimeout(() => { showInterstitial("app-launch"); }, 250);
    return () => clearTimeout(t);
  }, []);


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <KeyRound className="h-12 w-12 text-primary" />
        </motion.div>
      </div>
    );
  }

  // If the user already has a session AND has NOT explicitly asked to view
  // the landing page (e.g. via "Back to Home" from the verify screen), send
  // them straight to the locker. The sessionStorage flag is set once by
  // SecurityVerify so the landing can be reached without an immediate
  // redirect loop back into verification.
  if (user) {
    const wantsLanding = sessionStorage.getItem("showLandingOnce") === "1";
    if (wantsLanding) {
      sessionStorage.removeItem("showLandingOnce");
    } else {
      return <Navigate to="/locker" replace />;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with language selector — always reachable */}
      <div className="absolute top-0 right-0 z-20 p-3">
        <LanguageSelector compact={false} />
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img src={heroCabinet} alt="" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 py-24 text-center">

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex justify-center mb-6">
              <div className="brass-gradient rounded-2xl p-4 brass-glow">
                <KeyRound className="h-10 w-10 text-primary-foreground" />
              </div>
            </div>

            <h1 className="font-display text-5xl md:text-6xl font-bold mb-4 brass-text">
              DocLocker
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-lg mx-auto">
              {t("landing.heroDesc")}
            </p>

            <Link to="/auth">
              <Button className="brass-gradient text-primary-foreground text-lg px-8 py-6 hover:opacity-90 font-display font-semibold">
                {t("landing.openLocker")}
              </Button>
            </Link>

            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <Link to="/scan">
                <Button variant="outline" className="font-display">
                  <ScanLine className="h-4 w-4 mr-2" /> {t("landing.scanDoc")}
                </Button>
              </Link>
              <Link to="/view">
                <Button variant="outline" className="font-display">
                  <FileText className="h-4 w-4 mr-2" /> {t("landing.openFile")}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>


      {/* Features */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Shield className="h-6 w-6" />,
              title: t("landing.feature.secure.title"),
              desc: t("landing.feature.secure.desc"),
            },
            {
              icon: <Upload className="h-6 w-6" />,
              title: t("landing.feature.upload.title"),
              desc: t("landing.feature.upload.desc"),
            },
            {
              icon: <Download className="h-6 w-6" />,
              title: t("landing.feature.download.title"),
              desc: t("landing.feature.download.desc"),
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.15 }}
              className="wood-panel rounded-lg border border-border p-6 text-center"
            >
              <div className="brass-gradient rounded-lg p-3 inline-block mb-4">
                <div className="text-primary-foreground">{f.icon}</div>
              </div>
              <h3 className="font-display font-bold text-lg text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {t("landing.footer")}
      </footer>
    </div>
  );
};

export default Index;
