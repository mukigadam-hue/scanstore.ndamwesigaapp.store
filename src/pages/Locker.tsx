import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Plus, KeyRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import DrawerCard from "@/components/DrawerCard";
import DrawerView from "@/components/DrawerView";
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

const Locker = () => {
  const { user, signOut } = useAuth();
  const [drawers, setDrawers] = useState<Drawer[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDrawer, setSelectedDrawer] = useState<string | null>(null);
  const [showNewDrawer, setShowNewDrawer] = useState(false);
  const [newDrawerName, setNewDrawerName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    // Load drawers
    const { data: drawerData } = await supabase
      .from("drawers")
      .select("*")
      .eq("user_id", user.id);

    // If no drawers, create defaults
    if (!drawerData || drawerData.length === 0) {
      const defaults = DEFAULT_DRAWERS.map((d) => ({
        user_id: user.id,
        name: d.name,
        icon: d.icon,
        color: "brass",
      }));
      const { data: created } = await supabase.from("drawers").insert(defaults).select();
      setDrawers(created || []);
    } else {
      setDrawers(drawerData);
    }

    // Load documents
    const { data: docData } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setDocuments(docData || []);
    setLoading(false);
  };

  const addDrawer = async () => {
    if (!newDrawerName.trim() || !user) return;
    const { error } = await supabase.from("drawers").insert({
      user_id: user.id,
      name: newDrawerName.trim(),
      icon: "📁",
      color: "brass",
    });
    if (error) {
      toast.error("Failed to create drawer");
    } else {
      toast.success("New drawer added!");
      setNewDrawerName("");
      setShowNewDrawer(false);
      loadData();
    }
  };

  const getDocCount = (drawerName: string) =>
    documents.filter((d) => d.drawer_name === drawerName).length;

  const getDrawerDocs = (drawerName: string) =>
    documents.filter((d) => d.drawer_name === drawerName);

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

  return (
    <div className="min-h-screen bg-background relative">
      {/* Wood texture background */}
      <div
        className="fixed inset-0 opacity-5"
        style={{ backgroundImage: `url(${woodTexture})`, backgroundSize: "300px" }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="wood-panel border-b border-border sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="brass-gradient rounded-lg p-2">
                <KeyRound className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold brass-text">DocLocker</h1>
                <p className="text-xs text-muted-foreground">Your secure document vault</p>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Lock & Leave
            </Button>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
            {selectedDrawer ? (
              <DrawerView
                key="drawer-view"
                drawerName={selectedDrawer}
                documents={getDrawerDocs(selectedDrawer)}
                onBack={() => setSelectedDrawer(null)}
                onRefresh={loadData}
              />
            ) : (
              <motion.div
                key="locker-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Welcome */}
                <div className="mb-8">
                  <h2 className="font-display text-3xl font-bold brass-text mb-2">
                    Your Locker
                  </h2>
                  <p className="text-muted-foreground">
                    Tap a drawer to open it and manage your documents
                  </p>
                </div>

                {/* Drawer grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {drawers.map((drawer, i) => (
                    <DrawerCard
                      key={drawer.id}
                      name={drawer.name}
                      icon={drawer.icon}
                      documentCount={getDocCount(drawer.name)}
                      onClick={() => setSelectedDrawer(drawer.name)}
                      index={i}
                    />
                  ))}

                  {/* Add new drawer */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: drawers.length * 0.1 }}
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
                        onClick={() => setShowNewDrawer(true)}
                        className="w-full h-full min-h-[160px] rounded-lg border-2 border-dashed border-border hover:border-brass/50 flex flex-col items-center justify-center gap-2 transition-colors group"
                      >
                        <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                          Add Drawer
                        </span>
                      </button>
                    )}
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default Locker;
