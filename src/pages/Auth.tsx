import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
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
import PageHead from "@/components/PageHead";

type Mode =
  | "phone-signup"
  | "phone-login"
  | "email-login"
  | "recover-phone"
  | "recover-detect"
  | "recover-newpin";

const Auth = () => {
  const { t } = useTranslation();
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

  // Detect in-app browsers / WebViews (Facebook, Instagram, TikTok, Gmail
  // app, generic Android WebView, …). Google refuses OAuth from these with
  // "Error 403: disallowed_useragent", so we surface a clear message and
  // try to escape into the system browser instead of silently failing.
  const isWebView = () => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return (
      /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|; wv\)|WebView|GSA\//i.test(
        ua,
      ) ||
      // Android WebView typically lacks "Chrome/" on Version/ Mobile Safari path
      (/Android/.test(ua) && /Version\/[\d.]+\s+Chrome\/[\d.]+\s+Mobile Safari/.test(ua) === false &&
        /Mobile Safari/.test(ua) && !/Chrome\//.test(ua))
    );
  };

  const handleGoogleSignIn = async () => {
    if (isWebView()) {
      const url = window.location.href;
      toast.error(
        t("auth.webviewBlocked"),
        { duration: 10000 },
      );
      // Best-effort: try to launch the system browser.
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
      return;
    }
    setGoogleLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (error)
        toast.error(t("auth.googleSignInFailedWithMsg", { msg: (error as Error).message }));
    } catch {
      toast.error(t("auth.googleSignInFailed"));
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
      toast.error(t("auth.couldNotStartSession", { msg: error.message }));
      return;
    }
    toast.success(t("auth.vaultUnlocked"));
    // Navigation happens automatically via the user state in AuthProvider
  };

  const handlePhoneSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 6) {
      toast.error(t("auth.invalidPhone"));
      return;
    }
    if (!/^\d{5}$/.test(pin)) {
      toast.error(t("auth.pinMustBe5Digits"));
      return;
    }
    if (pin !== pin2) {
      toast.error(t("auth.pinsDoNotMatch"));
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
        toast.error(payload?.error || error?.message || t("auth.signUpFailed"));
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
      toast.error(t("auth.enterPhoneAndPin"));
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
        toast.error(payload?.error || error?.message || t("auth.signInFailed"));
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
      else toast.success(t("auth.welcomeBackToast"));
    } finally {
      setSubmitting(false);
    }
  };

  // Forgot PIN flow
  const handleRecoverStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 6) {
      toast.error(t("auth.invalidPhone"));
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
        toast.error(payload?.error || t("auth.couldNotStartRecovery"));
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
      toast.error(t("auth.newPinMustBe5Digits"));
      return;
    }
    if (newPin !== newPin2) {
      toast.error(t("auth.pinsDoNotMatch"));
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
        toast.error(payload?.error || t("auth.resetFailed"));
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
        return t("auth.welcomeBack");
      case "email-login":
        return t("auth.signInWithEmail");
      case "recover-phone":
        return t("auth.recoverMyVault");
      case "recover-detect":
        return t("auth.verifying");
      case "recover-newpin":
        return t("auth.setNewPin");
      default:
        return t("auth.openYourVault");
    }
  })();

  const subtitle = (() => {
    switch (mode) {
      case "phone-login":
        return t("auth.enterPhoneAndPinSub");
      case "email-login":
        return t("auth.forAccountsBeforePhone");
      case "recover-phone":
        return t("auth.enterPhoneToRecover");
      case "recover-detect":
        return t("auth.detectingSms");
      case "recover-newpin":
        return t("auth.chooseNewPin");
      default:
        return t("auth.fastPrivateNoEmail");
    }
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <PageHead
        title={t("auth.pageTitle")}
        description={t("auth.pageDescription")}
        path="/auth"
      />
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
                alt={t("auth.lockAlt")}
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
                      {t("auth.alreadyHaveVaultSignIn")}
                    </button>
                  </div>

                  <p className="text-center font-bold text-sm text-foreground">
                    {t("auth.newHereOpenAccount")}
                  </p>

                  <div className="flex gap-2">
                    <CountryCodePicker value={country} onChange={setCountry} />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder={t("auth.phoneNumberPlaceholder")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-1 h-11 bg-input border-border"
                      required
                    />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      {t("auth.createPin")}
                    </p>
                    <PinInput length={5} value={pin} onChange={setPin} />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      {t("auth.confirmPin")}
                    </p>
                    <PinInput length={5} value={pin2} onChange={setPin2} />
                  </div>

                  {showEmailField ? (
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder={t("auth.emailOptionalPlaceholder")}
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
                        {t("auth.skip")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowEmailField(true)}
                      className="w-full text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      {t("auth.addEmailOptional")}
                    </button>
                  )}

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? t("auth.opening") : t("auth.openMyVault")}
                  </Button>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode("recover-phone")}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      {t("auth.forgotPinRecover")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("email-login")}
                      className="text-xs text-muted-foreground/80 hover:text-primary transition-colors text-center mt-2"
                    >
                      {t("auth.loggedInWithEmail")}
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
                      placeholder={t("auth.phoneNumberPlaceholder")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-1 h-11 bg-input border-border"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      {t("auth.enterYourPin")}
                    </p>
                    <PinInput length={5} value={pin} onChange={setPin} />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? t("auth.unlocking") : t("auth.unlockMyVault")}
                  </Button>
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode("recover-phone")}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors text-center"
                    >
                      {t("auth.forgotPinRecover")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("phone-signup")}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 justify-center"
                    >
                      <ArrowLeft className="h-3 w-3" /> {t("auth.newHereCreateVault")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("email-login")}
                      className="text-xs text-muted-foreground/80 hover:text-primary transition-colors text-center mt-2"
                    >
                      {t("auth.loggedInWithEmail")}
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
                    {googleLoading ? t("auth.connecting") : t("auth.continueWithGoogle")}
                  </Button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">{t("auth.or")}</span>
                    </div>
                  </div>

                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder={t("auth.emailAddressPlaceholder")}
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
                        placeholder={t("auth.passwordPlaceholder")}
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
                      {submitting ? t("auth.signingIn") : t("auth.signIn")}
                    </Button>
                  </form>

                  <button
                    type="button"
                    onClick={() => setMode("phone-signup")}
                    className="w-full text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" /> {t("auth.backToPhoneSignup")}
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
                      placeholder={t("auth.phoneNumberPlaceholder")}
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
                    {submitting ? t("auth.startingRecovery") : t("auth.recoverMyVault")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setMode("phone-signup")}
                    className="w-full text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" /> {t("auth.back")}
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
                        ? t("auth.detectingSms")
                        : codeDetected
                          ? t("auth.codeVerified")
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
                      {t("auth.newPin")}
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
                      {t("auth.confirmNewPin")}
                    </p>
                    <PinInput length={5} value={newPin2} onChange={setNewPin2} />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 brass-gradient text-primary-foreground font-semibold hover:opacity-90"
                  >
                    {submitting ? t("auth.saving") : t("auth.saveAndUnlock")}
                  </Button>
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">{t("auth.optional")}</span>
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
                    {t("auth.linkGoogleEmail")}
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
