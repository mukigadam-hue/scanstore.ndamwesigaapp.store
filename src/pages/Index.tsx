import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { KeyRound, Shield, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import heroCabinet from "@/assets/hero-cabinet.jpg";

const Index = () => {
  const { user, loading } = useAuth();

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

  if (user) return <Navigate to="/locker" replace />;

  return (
    <div className="min-h-screen bg-background">
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
              Your personal document vault. Store, organize, and access your important files — anytime, anywhere.
            </p>

            <Link to="/auth">
              <Button className="brass-gradient text-primary-foreground text-lg px-8 py-6 hover:opacity-90 font-display font-semibold">
                Open Your Locker
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Shield className="h-6 w-6" />,
              title: "Secure Storage",
              desc: "Your documents are locked away safely, accessible only by you.",
            },
            {
              icon: <Upload className="h-6 w-6" />,
              title: "Easy Upload",
              desc: "Drag, drop, and store any document in your organized drawers.",
            },
            {
              icon: <Download className="h-6 w-6" />,
              title: "Download Anytime",
              desc: "Access and download your documents from any device, anywhere.",
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
        DocLocker — Keep your documents safe ✦
      </footer>
    </div>
  );
};

export default Index;
