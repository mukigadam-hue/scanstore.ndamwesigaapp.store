import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import brassLock from "@/assets/brass-lock.png";
import {
  CountryCodePicker,
  Country,
  useDetectedCountry,
} from "@/components/CountryCodePicker";
import { PinInput } from "@/components/PinInput";

type Mode =
  | "phone-signup"
  | "phone-login"
  | "email-login"
  | "recover-phone"
  | "recover-detect"
  | "recover-newpin";

const Auth = () => {
  const { user, loading, signIn } = useAuth();
  const detected = useDetectedCountry();

  const [mode, setMode] = useState<Mode>("phone-signup");
  const [country, setCountry] = useState<Country>(detected);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailField, setShowEmailField] = useState(false);

  // Email-login state
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Recovery state
  const [recoveryCode, setRecoveryCode] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [codeDetected, setCodeDetected] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    setCountry(detected);
  }, [detected]);

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

  const fullPhone = () =>
    country.dial + phone.replace(/\D/g, "").replace(/^0+/, "");

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error)
        toast.error("Google sign-in failed: " + (error as Error).message);
    } catch {
      toast.error("Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const setSessionAndGo = async (session: any) => {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) {
      toast.error("Could not start session: " + error.message);
      return;
    }
    toast.success("Vault unlocked!");
    // Navigation happens automatically via the user state in AuthProvider
  };

  const handlePhoneSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 6) {
      toast.error("Please enter a valid phone number");
      return;
    }
    if (!/^\d{5}$/.test(pin)) {
      toast.error("PIN must be exactly 5 digits");
      return;
    }
    if (pin !== pin2) {
      toast.error("PINs do not match");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "phone-pin-signup",
        {
          body: {
            phone: fullPhone(),
            pin,
            countryCode: country.code,
            email: showEmailField ? email.trim() || null : null,
          },
        },
      );
      const payload = data as any;
      if (error || payload?.error) {
        toast.error(payload?.error || error?.message || "Sign-up failed");
        return;
      }
      await setSessionAndGo(payload.session);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 6 || !/^\d{5}$/.test(pin)) {
      toast.error("Enter your phone and 5-digit PIN");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "phone-pin-login",
        { body: { phone: fullPhone(), pin } },
      );
      const payload = data as any;
      if (error || payload?.error) {
        toast.error(payload?.error || error?.message || "Sign-in failed");
        return;
      }
      await setSessionAndGo(payload.session);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signIn(loginEmail, password);
      if (error) toast.error(error.message);
      else toast.success("Welcome back!");
    } finally {
      setSubmitting(false);
    }
  };

  // Forgot PIN flow
  const handleRecoverStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 6) {
      toast.error("Please enter a valid phone number");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "phone-recover-start",
        { body: { phone: fullPhone() } },
      );
      const payload = data as any;
      if (error || payload?.error) {
        toast.error(payload?.error || "Could not start recovery");
        return;
      }
      // Move to detection screen; simulate auto-SMS detect for 3s, then auto-fill
      setMode("recover-detect");
      setDetecting(true);
      setCodeDetected(false);
      setRecoveryCode("");
      setTimeout(() => {
        setRecoveryCode(String(payload.code || "").padStart(6, "0"));
        setDetecting(false);
        setCodeDetected(true);
        setTimeout(() => setMode("recover-newpin"), 1200);
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{5}$/.test(newPin)) {
      toast.error("New PIN must be 5 digits");
      return;
    }
    if (newPin !== newPin2) {
      toast.error("PINs do not match");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "phone-pin-reset",
        {
          body: {
            phone: fullPhone(),
            code: recoveryCode,
            newPin,
          },
        },
      );
      const payload = data as any;
      if (error || payload?.error) {
        toast.error(payload?.error || "Reset failed");
        return;
      }
      await setSessionAndGo(payload.session);
    } finally {
      setSubmitting(false);
    }
  };

  const title = (() => {
    switch (mode) {
      case "phone-login":
        return "Welcome Back";
      case "email-login":
        return "Sign In with Email";
      case "recover-phone":
        return "Recover My Vault";
      case "recover-detect":
        return "Verifying…";
      case "recover-newpin":
        return "Set a New PIN";
      default:
        return "Open Your Vault";
    }
  })();

  const subtitle = (() => {
    switch (mode) {
      case "phone-login":
        return "Enter your phone and 5-digit PIN";
      case "email-login":
        return "For accounts created before phone sign-up";
      case "recover-phone":
        return "Enter your phone number to recover access";
      case "recover-detect":
        return "Detecting secure vault SMS code…";
      case "recover-newpin":
        return "Choose a new 5-digit Vault PIN";
      default:
        return "Fast, private, no email required";
    }
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="wood-panel rounded-lg overflow-hidden border border-border">
          <div className="brass-gradient h-2" />
          <div className="p-6 sm:p-8">
            <motion.div
              className="flex justify-center mb-5"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <img
                src={brassLock}
                alt="Lock"
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
              />
            </motion.div>

            <h1 className="text-2xl font-display font-bold text-center mb-1 brass-text">
              {title}
            </h1>
            <p className="text-center text-muted-foreground text-sm mb-6">
              {subtitle}
            </p>

            <AnimatePresence mode="wait">
              {/* PHONE SIGN-UP (Day 1 front door) */}
              {mode === "phone-signup" && (
                <motion.form
                  key="phone-signup"
                  onSubmit={handlePhoneSignup}
                  className="space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("phone-login");
                        setPin("");
                      }}
                      className="block w-full font-bold text-base text-primary hover:underline"
                    >
                      Already have a vault? Sign in
                    </button>
                  </div>

                  <p className="text-center font-bold text-sm text-foreground">
                    New here? Open the account
                  </p>

                  <div className="flex gap-2">
                    <CountryCodePicker value={country} onChange={setCountry} />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-1 h-11 bg-input border-border"
                      required
                    />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      Create a 5-digit Vault PIN
                    </p>
                    <PinInput length={5} value={pin} onChange={setPin} />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      Confirm PIN
                    </p>
                    <PinInput length={5} value={pin2} onChange={setPin2} />
                  </div>

                  {showEmailField ? (
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="Email (optional)"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 pr-16 h-11 bg-input border-border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmailField(false);
                          setEmail("");
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Skip
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowEmailField(true)}
                      className="w-full text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      + Add email (optional, for backup)
                    </button>
                  )}

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? "Opening…" : "Open My Vault"}
                  </Button>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode("recover-phone")}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      Forgot PIN / Recover My Vault →
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("email-login")}
                      className="text-xs text-muted-foreground/80 hover:text-primary transition-colors text-center mt-2"
                    >
                      Logged in before with Email? Tap here
                    </button>
                  </div>

                </motion.form>
              )}

              {/* PHONE LOGIN */}
              {mode === "phone-login" && (
                <motion.form
                  key="phone-login"
                  onSubmit={handlePhoneLogin}
                  className="space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex gap-2">
                    <CountryCodePicker value={country} onChange={setCountry} />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-1 h-11 bg-input border-border"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      Enter your 5-digit Vault PIN
                    </p>
                    <PinInput length={5} value={pin} onChange={setPin} />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? "Unlocking…" : "Unlock My Vault"}
                  </Button>
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode("recover-phone")}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      Forgot PIN / Recover My Vault →
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("phone-signup")}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 justify-center"
                    >
                      <ArrowLeft className="h-3 w-3" /> New here? Create a vault
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("email-login")}
                      className="text-xs text-muted-foreground/80 hover:text-primary transition-colors text-center mt-2"
                    >
                      Logged in before with Email? Tap here
                    </button>
                  </div>
                </motion.form>
              )}

              {/* EMAIL LOGIN (legacy) */}
              {mode === "email-login" && (
                <motion.div
                  key="email-login"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11"
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

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="Email address"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10 h-11 bg-input border-border"
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
                        className="pl-10 pr-10 h-11 bg-input border-border"
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
                      className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                    >
                      {submitting ? "Signing in…" : "Sign In"}
                    </Button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setMode("phone-signup")}
                    className="w-full text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back to phone sign-up
                  </button>
                </motion.div>
              )}

              {/* RECOVERY — phone entry */}
              {mode === "recover-phone" && (
                <motion.form
                  key="recover-phone"
                  onSubmit={handleRecoverStart}
                  className="space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex gap-2">
                    <CountryCodePicker value={country} onChange={setCountry} />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-1 h-11 bg-input border-border"
                      required
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? "Starting recovery…" : "Recover My Vault"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMode("phone-signup")}
                    className="w-full text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                </motion.form>
              )}

              {/* RECOVERY — auto SMS detection screen */}
              {mode === "recover-detect" && (
                <motion.div
                  key="recover-detect"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6 py-4"
                >
                  <div className="flex flex-col items-center gap-4">
                    {detecting ? (
                      <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    ) : codeDetected ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring" }}
                      >
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                      </motion.div>
                    ) : null}
                    <p className="text-sm text-center text-muted-foreground">
                      {detecting
                        ? "Detecting secure vault SMS code…"
                        : codeDetected
                          ? "Code verified successfully"
                          : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    {recoveryCode.padEnd(6, " ").split("").map((d, i) => (
                      <div
                        key={i}
                        className={`w-10 h-12 flex items-center justify-center text-xl font-semibold rounded-md border-2 ${
                          d.trim()
                            ? "border-green-500 bg-green-500/10 text-foreground"
                            : "border-border bg-input text-muted-foreground"
                        }`}
                      >
                        {d.trim() || "•"}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* RECOVERY — set new PIN */}
              {mode === "recover-newpin" && (
                <motion.form
                  key="recover-newpin"
                  onSubmit={handleNewPin}
                  className="space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      New 5-digit Vault PIN
                    </p>
                    <PinInput
                      length={5}
                      value={newPin}
                      onChange={setNewPin}
                      autoFocus
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      Confirm new PIN
                    </p>
                    <PinInput length={5} value={newPin2} onChange={setNewPin2} />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? "Saving…" : "Save & Unlock Vault"}
                  </Button>
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">optional</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                  >
                    <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Link a Google email
                  </Button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
