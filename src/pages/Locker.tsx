import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Plus, KeyRound, X, Crown, Timer, Info, Shield, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import DrawerCard from "@/components/DrawerCard";
import DrawerView from "@/components/DrawerView";
import SecuritySetup from "@/components/SecuritySetup";
import SecurityVerify from "@/components/SecurityVerify";
import StorageBar from "@/components/StorageBar";
import SubscriptionAlert from "@/components/SubscriptionAlert";
import PricingDialog from "@/components/PricingDialog";
import AutoLockSettings from "@/components/AutoLockSettings";
import { useSubscription } from "@/hooks/useSubscription";
import { useAutoLock } from "@/hooks/useAutoLock";
import woodTexture from "@/assets/wood-texture.jpg";
import { UpgradeVaultBanner } from "@/components/UpgradeVaultBanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LanguageSelector from "@/components/LanguageSelector";
import { useTranslation } from "react-i18next";
import { getPendingVaultFile, clearPendingVaultFile } from "@/lib/pendingVaultFile";
import BannerAd from "@/components/BannerAd";

interface Drawer {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Document {
  id: string;
  name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  drawer_name: string;
  created_at: string;
}

const DEFAULT_DRAWERS = [
  { name: "Personal IDs", icon: "🪪" },
  { name: "Financial", icon: "💰" },
  { name: "Medical", icon: "🏥" },
  { name: "Education", icon: "🎓" },
  { name: "Work", icon: "💼" },
  { name: "Legal", icon: "⚖️" },
];

const FREE_DRAWER_LIMIT = 6;

const DRAWER_COLORS = [
  "brass", "bronze", "copper", "gold", "silver", "iron",
];

const Locker = () => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedDrawer, setSelectedDrawer] = useState<string | null>(null);
  const [showNewDrawer, setShowNewDrawer] = useState(false);
  const [newDrawerName, setNewDrawerName] = useState("");
  const [sessionVerified, setSessionVerified] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showAutoLock, setShowAutoLock] = useState(false);
  const [showSecuritySetup, setShowSecuritySetup] = useState(false);

  const { currentPlan, isFrozen, isRetrievalActive, showExpiryWarning, daysUntilExpiry } = useSubscription();
  const canAccessDrawers = !isFrozen || isRetrievalActive;
  const isPremium = currentPlan.id !== "free";

  const [autoLockSeconds, setAutoLockSeconds] = useState(() => {
    const saved = localStorage.getItem("doclocker_autolock");
    return saved ? parseInt(saved, 10) : 60;
  });

  const handleAutoLockSave = (seconds: number) => {
    setAutoLockSeconds(seconds);
    localStorage.setItem("doclocker_autolock", seconds.toString());
    toast.success(seconds === 0 ? "Auto-lock disabled" : `Auto-lock set to ${seconds}s`);
  };

  const { pause: pauseAutoLock, resume: resumeAutoLock } = useAutoLock({
    enabled: sessionVerified && autoLockSeconds > 0,
    timeoutMs: autoLockSeconds * 1000,
    onLock: () => {
      if (user?.id) {
        localStorage.removeItem(`locker_verified_${user.id}`);
      }
      setSessionVerified(false);
      toast.info("Locker auto-locked due to inactivity 🔒");
    },
  });

  useEffect(() => {
    if (user?.id) {
      const verified = localStorage.getItem(`locker_verified_${user.id}`) === "true";
      if (verified) setSessionVerified(true);
    }
  }, [user?.id]);

  // ---- Pending vault file (from /view "Save to Secure Vault") ----
  const [pendingFile, setPendingFile] = useState<{ name: string; type: string; dataUrl: string } | null>(null);
  const [pendingUploading, setPendingUploading] = useState(false);

  useEffect(() => {
    if (!sessionVerified) return;
    const staged = getPendingVaultFile();
    if (staged) setPendingFile(staged);
  }, [sessionVerified]);

  const uploadPendingTo = async (drawerName: string) => {
    if (!pendingFile || !user) return;
    setPendingUploading(true);
    try {
      const [, b64] = pendingFile.dataUrl.split(",");
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: pendingFile.type });
      const filePath = `${user.id}/${Date.now()}_${pendingFile.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(filePath, blob);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("documents").insert({
        user_id: user.id,
        name: pendingFile.name,
        file_path: filePath,
        file_size: blob.size,
        file_type: pendingFile.type,
        drawer_name: drawerName,
      });
      if (dbErr) throw dbErr;
      toast.success(`Saved to ${drawerName}`);
      clearPendingVaultFile();
      setPendingFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", user.id] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save to vault");
    } finally {
      setPendingUploading(false);
    }
  };


  const markVerified = () => {
    if (user?.id) localStorage.setItem(`locker_verified_${user.id}`, "true");
    setSessionVerified(true);
  };

  const { data: securitySettings, isLoading: secLoading } = useQuery({
    queryKey: ["security_settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("security_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const { data: drawers = [], isLoading: drawersLoading } = useQuery({
    queryKey: ["drawers", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("drawers")
        .select("*")
        .eq("user_id", user!.id);

      if (!data || data.length === 0) {
        const defaults = DEFAULT_DRAWERS.map((d) => ({
          user_id: user!.id,
          name: d.name,
          icon: d.icon,
          color: "brass",
        }));
        const { data: created } = await supabase
          .from("drawers")
          .insert(defaults)
          .select();
        return (created || []) as Drawer[];
      }
      return data as Drawer[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["documents", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data || []) as Document[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const freeDrawers = drawers.slice(0, FREE_DRAWER_LIMIT);
  const extraDrawers = drawers.slice(FREE_DRAWER_LIMIT);

  // Check if essential drawers have documents (compulsory fill rule)
  const essentialDrawersFilled = freeDrawers.every(
    (drawer) => documents.some((d) => d.drawer_name === drawer.name)
  );

  const addDrawer = async () => {
    if (!newDrawerName.trim() || !user) return;
    if (!isPremium) {
      toast.error("Upgrade to Premium to add custom drawers!");
      setShowPricing(true);
      return;
    }
    if (!essentialDrawersFilled) {
      toast.error("Please fill all 6 Essential Drawers first before creating custom drawers.");
      return;
    }
    const colorIndex = extraDrawers.length % DRAWER_COLORS.length;
    const { error } = await supabase.from("drawers").insert({
      user_id: user.id,
      name: newDrawerName.trim(),
      icon: "📁",
      color: DRAWER_COLORS[colorIndex],
    });
    if (error) {
      toast.error("Failed to create drawer");
    } else {
      toast.success("New drawer added!");
      setNewDrawerName("");
      setShowNewDrawer(false);
      queryClient.invalidateQueries({ queryKey: ["drawers", user.id] });
    }
  };

  const getDocCount = (drawerName: string) =>
    documents.filter((d) => d.drawer_name === drawerName).length;

  const getDrawerDocs = (drawerName: string) =>
    documents.filter((d) => d.drawer_name === drawerName);

  const handleDrawerClick = (drawerName: string) => {
    if (!canAccessDrawers) {
      toast.error("Your vault is frozen. Pay the retrieval fee to access documents.");
      return;
    }
    setSelectedDrawer(drawerName);
  };

  if (secLoading || drawersLoading) {
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

  if (!securitySettings?.setup_completed) {
    return (
      <SecuritySetup
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["security_settings", user?.id] });
          setShowSecuritySetup(false);
          if (!sessionVerified) markVerified();
        }}
      />
    );
  }

  if (showSecuritySetup) {
    return (
      <SecuritySetup
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["security_settings", user?.id] });
          setShowSecuritySetup(false);
        }}
        onCancel={() => setShowSecuritySetup(false)}
      />
    );
  }

  if (!sessionVerified) {
    return (
      <SecurityVerify
        settings={securitySettings}
        onVerified={markVerified}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background relative">
      <div
        className="fixed inset-0 opacity-5"
        style={{
          backgroundImage: `url(${woodTexture})`,
          backgroundSize: "300px",
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="wood-panel border-b border-border sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <div className="brass-gradient rounded-lg p-2">
                <KeyRound className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-display text-xl font-bold brass-text">
                  DocLocker
                </h1>
                <p className="text-xs text-muted-foreground">
                  {t("common.tagline")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap flex-1 justify-end">
              <StorageBar />
              <LanguageSelector compact />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSecuritySetup(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 px-2"
                title={t("locker.security")}
              >
                <Shield className="h-4 w-4 mr-1.5" />
                <span className="text-xs">{t("locker.security")}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAutoLock(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 px-2"
                title={t("locker.autolock")}
              >
                <Timer className="h-4 w-4 mr-1.5" />
                <span className="text-xs">{t("locker.autolock")}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPricing(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 px-2"
                title={t("locker.upgrade")}
              >
                <Crown className="h-4 w-4 mr-1.5" />
                <span className="text-xs">
                  {currentPlan.name === "Free" ? t("locker.upgrade") : currentPlan.name}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // "Lock & Leave" = lock the vault (require re-verification)
                  // but keep the user signed in, exactly like the auto-lock
                  // behaviour. Sign-out is a separate, deliberate action.
                  if (user?.id) {
                    localStorage.removeItem(`locker_verified_${user.id}`);
                  }
                  setSessionVerified(false);
                  setSelectedDrawer(null);
                  toast.info("Vault locked 🔒");
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 px-2"
                title={t("locker.signOut")}
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                <span className="text-xs">{t("locker.signOut")}</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <UpgradeVaultBanner />
          <AnimatePresence mode="popLayout">
            {selectedDrawer ? (
              <DrawerView
                key="drawer-view"
                drawerName={selectedDrawer}
                documents={getDrawerDocs(selectedDrawer)}
                onBack={() => setSelectedDrawer(null)}
                onScanStart={pauseAutoLock}
                onScanEnd={resumeAutoLock}
              />
            ) : (
              <motion.div
                key="locker-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Subscription alerts */}
                <SubscriptionAlert />

                {/* Premium tip */}
                {isPremium && showExpiryWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">Tip:</span> Your subscription expires in {daysUntilExpiry} days.
                        Store your most essential documents in the first 6 drawers —
                        these remain accessible on the free tier (50 MB) even after your premium expires.
                      </p>
                    </div>
                  </motion.div>
                )}

                <div className="mb-8">
                  <h2 className="font-display text-3xl font-bold brass-text mb-2">
                    {t("locker.title")}
                  </h2>
                  <p className="text-muted-foreground">
                    {t("locker.subtitle")}
                  </p>
                </div>

                {/* Essential Drawers */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t("locker.essential")}
                    </span>
                    <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {t("locker.alwaysFree")}
                    </span>
                  </div>

                  {/* Compulsory fill warning */}
                  {!essentialDrawersFilled && isPremium && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          <span className="text-foreground font-medium">Important:</span> Fill all 6 essential drawers with your most critical documents first. These remain accessible even if your premium subscription expires.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {freeDrawers.map((drawer, i) => (
                      <DrawerCard
                        key={drawer.id}
                        name={drawer.name}
                        icon={drawer.icon}
                        documentCount={getDocCount(drawer.name)}
                        onClick={() => handleDrawerClick(drawer.name)}
                        index={i}
                      />
                    ))}
                  </div>
                </div>

                {/* Custom Drawers Section - only visible for premium users */}
                {isPremium && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t("locker.custom")}
                      </span>
                      <Crown className="h-3.5 w-3.5 text-primary" />
                    </div>

                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <Plus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          <span className="text-foreground font-medium">Create your own drawers!</span>{" "}
                          Name them however you like to organize your documents.
                          {!essentialDrawersFilled && (
                            <span className="text-yellow-500 font-medium"> Fill all essential drawers first to unlock this.</span>
                          )}
                        </p>
                      </div>
                    </motion.div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {extraDrawers.map((drawer, i) => (
                        <DrawerCard
                          key={drawer.id}
                          name={drawer.name}
                          icon={drawer.icon}
                          documentCount={getDocCount(drawer.name)}
                          onClick={() => handleDrawerClick(drawer.name)}
                          index={i}
                        />
                      ))}

                      {/* Add new drawer button */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: extraDrawers.length * 0.05 }}
                      >
                        {showNewDrawer ? (
                          <div className="wood-panel rounded-lg border border-border p-5">
                            <div className="brass-gradient h-1.5 rounded-t -mt-5 -mx-5 mb-4" />
                            <Input
                              placeholder={t("locker.drawerName")}
                              value={newDrawerName}
                              onChange={(e) => setNewDrawerName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addDrawer()}
                              className="mb-3 bg-input border-border text-foreground placeholder:text-muted-foreground"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={addDrawer}
                                className="flex-1 brass-gradient text-primary-foreground hover:opacity-90"
                              >
                                {t("common.create")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowNewDrawer(false)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (!essentialDrawersFilled) {
                                toast.error(t("locker.fillFirst"));
                                return;
                              }
                              setShowNewDrawer(true);
                            }}
                            className="w-full h-full min-h-[160px] rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 transition-colors group"
                          >
                            <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                              {t("locker.addDrawer")}
                            </span>
                          </button>
                        )}
                      </motion.div>
                    </div>
                  </div>
                )}

                {/* Upgrade prompt for free users */}
                {!isPremium && (
                  <div className="mb-6">
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center"
                    >
                      <Crown className="h-6 w-6 text-primary mx-auto mb-2" />
                      <p className="text-sm text-foreground font-medium mb-1">{t("locker.upgradeMore")}</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        {t("locker.upgradeMoreDesc")}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setShowPricing(true)}
                        className="brass-gradient text-primary-foreground"
                      >
                        <Crown className="h-4 w-4 mr-1.5" />
                        {t("locker.upgradeNow")}
                      </Button>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        {/* Bottom banner ad — reserves its own space so nothing is covered. */}
        <BannerAd slot="dashboard" />
      </div>

      <PricingDialog
        open={showPricing}
        onClose={() => setShowPricing(false)}
      />

      <AutoLockSettings
        open={showAutoLock}
        onClose={() => setShowAutoLock(false)}
        currentTimeout={autoLockSeconds}
        onSave={handleAutoLockSave}
      />

      <Dialog open={!!pendingFile} onOpenChange={(o) => { if (!o) { clearPendingVaultFile(); setPendingFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save to Secure Vault</DialogTitle>
            <DialogDescription>
              Pick a drawer for <span className="font-medium">{pendingFile?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 mt-2 max-h-[50vh] overflow-y-auto">
            {drawers.map((d) => (
              <Button
                key={d.id}
                variant="outline"
                disabled={pendingUploading}
                onClick={() => uploadPendingTo(d.name)}
                className="justify-start"
              >
                <span className="mr-2">{d.icon}</span> {d.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Locker;
