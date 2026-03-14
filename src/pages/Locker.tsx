import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Plus, KeyRound, X, Crown, Timer, Info, Shield, Settings } from "lucide-react";
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

  // Auto-lock settings
  const [autoLockSeconds, setAutoLockSeconds] = useState(() => {
    const saved = localStorage.getItem("doclocker_autolock");
    return saved ? parseInt(saved, 10) : 60;
  });

  const handleAutoLockSave = (seconds: number) => {
    setAutoLockSeconds(seconds);
    localStorage.setItem("doclocker_autolock", seconds.toString());
    toast.success(seconds === 0 ? "Auto-lock disabled" : `Auto-lock set to ${seconds}s`);
  };

  useAutoLock({
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

  const addDrawer = async () => {
    if (!newDrawerName.trim() || !user) return;
    if (!isPremium) {
      toast.error("Upgrade to Premium to add custom drawers!");
      setShowPricing(true);
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
                  Your secure document vault
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
              <StorageBar />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSecuritySetup(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                title="Security settings"
              >
                <Shield className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAutoLock(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
                title="Auto-lock settings"
              >
                <Timer className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPricing(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
              >
                <Crown className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">
                  {currentPlan.name === "Free" ? "Upgrade" : currentPlan.name}
                </span>
              </Button>
              <Button
                variant="ghost"
                onClick={signOut}
                className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Lock & Leave</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <AnimatePresence mode="popLayout">
            {selectedDrawer ? (
              <DrawerView
                key="drawer-view"
                drawerName={selectedDrawer}
                documents={getDrawerDocs(selectedDrawer)}
                onBack={() => setSelectedDrawer(null)}
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
                    Your Locker
                  </h2>
                  <p className="text-muted-foreground">
                    Tap a drawer to open it and manage your documents
                  </p>
                </div>

                {/* Essential Drawers */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Essential Drawers
                    </span>
                    <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Always Free
                    </span>
                  </div>
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

                {/* Custom Drawers Section */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Custom Drawers
                    </span>
                    <Crown className="h-3.5 w-3.5 text-primary" />
                  </div>

                  {/* Info message */}
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Plus className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">Add as many drawers as you need!</span>{" "}
                        Create custom drawers with your own names to organize your documents however you like.
                        All custom drawers share your plan's storage limit.
                        {!isPremium && (
                          <span>
                            {" "}
                            <button
                              onClick={() => setShowPricing(true)}
                              className="text-primary hover:underline font-medium"
                            >
                              Upgrade to Premium
                            </button>{" "}
                            to unlock custom drawers.
                          </span>
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
                        onClick={() => {
                          if (!isPremium) {
                            toast.error("Premium subscription required for custom drawers");
                            setShowPricing(true);
                            return;
                          }
                          handleDrawerClick(drawer.name);
                        }}
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
                            placeholder="Drawer name..."
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
                              Create
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
                            if (!isPremium) {
                              toast.info("Upgrade to Premium to add custom drawers!");
                              setShowPricing(true);
                              return;
                            }
                            setShowNewDrawer(true);
                          }}
                          className="w-full h-full min-h-[160px] rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 transition-colors group"
                        >
                          <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                            Add Drawer
                          </span>
                        </button>
                      )}
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
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
    </div>
  );
};

export default Locker;
