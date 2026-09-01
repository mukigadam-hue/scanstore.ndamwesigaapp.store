import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { KeyRound, Shield, Download, Upload, ScanLine, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

import { useTranslation } from "react-i18next";
import heroCabinet from "@/assets/hero-cabinet.jpg";
import LanguageSelector from "@/components/LanguageSelector";
import PageHead from "@/components/PageHead";
import GooglePlayButton from "@/components/GooglePlayButton";


const Index = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  // Note: no app-launch or navigation-based interstitial ads.
  // Ads only fire at explicit user actions (identity verified, save-to-phone).


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin">
          <KeyRound className="h-12 w-12 text-primary" />
        </div>
      </div>
    );
  }

  if (user && localStorage.getItem(`doclocker_exit_needs_verify_${user.id}`) === "1") {
    return <Navigate to="/locker" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-[60px]">
      <PageHead
        title="DocLocker — Secure Personal Document Vault"
        description="Scan, store, and organize important documents on your phone with encrypted, biometric-locked storage."
        path="/"
      />
      {/* Top bar with language selector — always reachable */}
      <div className="absolute top-0 right-0 z-20 p-3">
        <LanguageSelector compact={false} />
      </div>

      <main>
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img src={heroCabinet} alt="Antique wooden filing cabinet representing DocLocker's secure vault" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 py-24 text-center">

          <div>
            <div className="flex justify-center mb-6">
              <div className="brass-gradient rounded-2xl p-4 brass-glow">
                <KeyRound className="h-10 w-10 text-primary-foreground" />
              </div>
            </div>

            <h1 className="font-display text-5xl md:text-6xl font-bold mb-4 brass-text">
              DocLocker — Secure Personal Document Vault
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-lg mx-auto">
              {t("landing.heroDesc")}
            </p>

            <Link to={user ? "/locker" : "/auth"}>
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

            <div className="mt-6 flex justify-center">
              <GooglePlayButton label={t("landing.getOnGooglePlay")} />
            </div>
          </div>
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
            <div
              key={f.title}
              className="wood-panel rounded-lg border border-border p-6 text-center"
            >
              <div className="brass-gradient rounded-lg p-3 inline-block mb-4">
                <div className="text-primary-foreground">{f.icon}</div>
              </div>
              <h3 className="font-display font-bold text-lg text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
      </main>



      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        {t("landing.footer")}
      </footer>
    </div>
  );
};

export default Index;
