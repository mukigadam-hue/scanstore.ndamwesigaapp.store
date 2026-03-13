import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { Lock, Mail, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import brassLock from "@/assets/brass-lock.png";

const Auth = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password reset link sent! Check your email inbox.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Welcome back to your locker!");
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Account created! Check your email to verify before signing in.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="wood-panel rounded-lg overflow-hidden border border-border">
          <div className="brass-gradient h-2" />

          <div className="p-8">
            <motion.div
              className="flex justify-center mb-6"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
            >
              <div className="relative">
                <img src={brassLock} alt="Lock" className="w-20 h-20 object-contain" />
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{ boxShadow: ["0 0 10px hsl(38 70% 50% / 0.2)", "0 0 25px hsl(38 70% 50% / 0.4)", "0 0 10px hsl(38 70% 50% / 0.2)"] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            </motion.div>

            <h1 className="text-2xl font-display font-bold text-center mb-1 brass-text">
              {isForgot ? "Reset Password" : isLogin ? "Unlock Your Locker" : "Create Your Locker"}
            </h1>
            <p className="text-center text-muted-foreground text-sm mb-8">
              {isForgot
                ? "Enter your email to receive a password reset link"
                : isLogin
                  ? "Enter your credentials to access your documents"
                  : "Set up your secure document locker (email verification required)"}
            </p>

            {isForgot ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                    required
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                >
                  {submitting ? "Sending…" : "Send Reset Link"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsForgot(false)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                      required
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full brass-gradient text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                  >
                    {submitting ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
                        <KeyRound className="h-4 w-4" />
                      </motion.div>
                    ) : isLogin ? "Unlock" : "Create Locker"}
                  </Button>
                </form>

                <div className="mt-4 flex flex-col items-center gap-2">
                  {isLogin && (
                    <button
                      onClick={() => setIsForgot(true)}
                      className="text-sm text-primary/80 hover:text-primary transition-colors"
                    >
                      Forgot your password?
                    </button>
                  )}
                  <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isLogin ? "Don't have a locker? Create one" : "Already have a locker? Unlock it"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="brass-gradient h-1" />
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
