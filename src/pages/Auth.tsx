import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import { Lock, Mail, Eye, EyeOff, KeyRound, Phone, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import brassLock from "@/assets/brass-lock.png";

type Mode =
  | "login"
  | "signup"
  | "recover-choice"
  | "forgot-password"
  | "forgot-email";

const Auth = () => {
  const { user, loading, signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [revealedEmail, setRevealedEmail] = useState<{
    masked: string;
    full: string;
  } | null>(null);

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

  const isLogin = mode === "login";
  const isSignup = mode === "signup";

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error) {
        toast.error("Google sign-in failed: " + (error as Error).message);
      }
    } catch {
      toast.error("Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const sendPasswordReset = async (targetEmail: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Password reset link sent! Check your email inbox.");
    return true;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await sendPasswordReset(email);
      if (ok) setMode("login");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.replace(/\D/g, "").length < 6) {
      toast.error("Please enter a valid phone number");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "recover-email-by-phone",
        { body: { phone } },
      );
      if (error) {
        toast.error("Lookup failed. Please try again.");
        return;
      }
      if (!data?.found) {
        toast.error("No account found for that phone number.");
        setRevealedEmail(null);
        return;
      }
      setRevealedEmail({ masked: data.maskedEmail, full: data.email });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendResetForRevealed = async () => {
    if (!revealedEmail) return;
    setSubmitting(true);
    try {
      const ok = await sendPasswordReset(revealedEmail.full);
      if (ok) {
        setRevealedEmail(null);
        setPhone("");
        setMode("login");
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
        // Sign up — phone required, stored in user_metadata so the trigger
        // copies it into profiles.phone for future recovery.
        if (!phone || phone.replace(/\D/g, "").length < 6) {
          toast.error("Please enter a valid phone number for account recovery");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { phone: phone.trim() },
          },
        });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(
            "Account created! Check your email to verify before signing in.",
          );
          setMode("login");
        }
      }
    } catch (err: any) {
      if (err?.message?.includes("Failed to fetch")) {
        toast.error("Network error. Please check your connection and try again.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const headerTitle = (() => {
    switch (mode) {
      case "signup":
        return "Create Your Locker";
      case "recover-choice":
        return "Recover Your Account";
      case "forgot-password":
        return "Reset Password";
      case "forgot-email":
        return "Find My Email";
      default:
        return "Unlock Your Locker";
    }
  })();

  const headerSubtitle = (() => {
    switch (mode) {
      case "signup":
        return "Set up your secure document locker (email verification required)";
      case "recover-choice":
        return "Choose how you'd like to recover your account";
      case "forgot-password":
        return "Enter your email to receive a password reset link";
      case "forgot-email":
        return "Enter the phone number you used at sign-up to find your account";
      default:
        return "Enter your credentials to access your documents";
    }
  })();

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
              </div>
            </motion.div>

            <h1 className="text-2xl font-display font-bold text-center mb-1 brass-text">
              {headerTitle}
            </h1>
            <p className="text-center text-muted-foreground text-sm mb-6">
              {headerSubtitle}
            </p>

            {/* Google Sign-In — only on login/signup */}
            {(isLogin || isSignup) && (
              <div className="mb-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 border-border text-foreground hover:bg-secondary"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                >
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {googleLoading ? "Connecting…" : "Continue with Google"}
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              </div>
            )}

            {/* Recovery choice screen */}
            {mode === "recover-choice" && (
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full h-auto py-4 brass-gradient text-primary-foreground font-semibold flex flex-col items-start hover:opacity-90"
                  onClick={() => setMode("forgot-password")}
                >
                  <span className="flex items-center gap-2 text-base">
                    <Mail className="h-4 w-4" /> I remember my email
                  </span>
                  <span className="text-xs font-normal opacity-90 mt-1 ml-6">
                    Send a password reset link to my email
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-auto py-4 border-border text-foreground flex flex-col items-start hover:bg-secondary"
                  onClick={() => setMode("forgot-email")}
                >
                  <span className="flex items-center gap-2 text-base">
                    <Phone className="h-4 w-4" /> I forgot my email
                  </span>
                  <span className="text-xs font-normal opacity-80 mt-1 ml-6">
                    Find my account using my phone number
                  </span>
                </Button>

                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1 mt-2"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </button>
              </div>
            )}

            {/* Forgot password — by email */}
            {mode === "forgot-password" && (
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
                <button
                  type="button"
                  onClick={() => setMode("recover-choice")}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
              </form>
            )}

            {/* Forgot email — by phone */}
            {mode === "forgot-email" && (
              <div className="space-y-4">
                {!revealedEmail ? (
                  <form onSubmit={handlePhoneLookup} className="space-y-4">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        placeholder="Phone number (e.g. +256 700 000 000)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
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
                      {submitting ? "Searching…" : "Find My Account"}
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md border border-border bg-input p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">
                        Account found! Your email is:
                      </p>
                      <p className="text-lg font-mono font-semibold brass-text">
                        {revealedEmail.masked}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={handleSendResetForRevealed}
                      disabled={submitting}
                      className="w-full brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                    >
                      {submitting ? "Sending…" : "Send Reset Link to This Email"}
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRevealedEmail(null);
                    setMode("recover-choice");
                  }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
              </div>
            )}

            {/* Login / Sign up form */}
            {(isLogin || isSignup) && (
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

                  {isSignup && (
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        placeholder="Phone number (for account recovery)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
                        required
                      />
                    </div>
                  )}

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
                      onClick={() => setMode("recover-choice")}
                      className="text-sm text-primary/80 hover:text-primary transition-colors"
                    >
                      Forgot email or password?
                    </button>
                  )}
                  <button
                    onClick={() => setMode(isLogin ? "signup" : "login")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isLogin
                      ? "Don't have a locker? Create one"
                      : "Already have a locker? Unlock it"}
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
