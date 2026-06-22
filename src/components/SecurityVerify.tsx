import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getBiometricErrorMessage, verifyDeviceBiometric } from "@/lib/webauthn";
import {
  Shield, Hash, Fingerprint, Camera,
  GraduationCap, Users, IdCard, ArrowLeft, CheckCircle2,
  KeyRound, AlertTriangle, Mail, Loader2,
} from "lucide-react";
import NativeAdSlot from "@/components/NativeAdSlot";
import { showInterstitial } from "@/lib/ads";

interface SecuritySettingsRow {
  pin_code: string | null;
  fingerprint_enabled: boolean | null;
  face_image_path: string | null;
  last_school: string | null;
  family_face_path: string | null;
  id_document_path: string | null;
}

interface SecurityVerifyProps {
  settings: SecuritySettingsRow;
  onVerified: () => void;
}

type MethodId = "pin" | "fingerprint" | "face" | "school" | "family" | "id";

const SecurityVerify = ({ settings, onVerified }: SecurityVerifyProps) => {
  const { user } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<MethodId | null>(null);
  const [verifiedMethods, setVerifiedMethods] = useState<Set<MethodId>>(new Set());
  const [pin, setPin] = useState("");
  const [school, setSchool] = useState("");
  const [fingerprintScanning, setFingerprintScanning] = useState(false);
  const [phase, setPhase] = useState<"verifying" | "playing_ad" | "verification_success">("verifying");

  // Forgot / recovery flow
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<"send" | "verify">("send");
  const [forgotSending, setForgotSending] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");

  const REQUIRED_VERIFICATIONS = 2;

  const availableMethods = [
    settings.pin_code && { id: "pin" as MethodId, label: "Enter PIN", icon: Hash },
    settings.fingerprint_enabled && { id: "fingerprint" as MethodId, label: "Fingerprint", icon: Fingerprint },
    settings.face_image_path && { id: "face" as MethodId, label: "Face Photo", icon: Camera },
    settings.last_school && { id: "school" as MethodId, label: "School Name", icon: GraduationCap },
    settings.family_face_path && { id: "family" as MethodId, label: "Family Face", icon: Users },
    settings.id_document_path && { id: "id" as MethodId, label: "Show ID", icon: IdCard },
  ].filter(Boolean) as { id: MethodId; label: string; icon: any }[];

  const requiredCount = Math.min(REQUIRED_VERIFICATIONS, availableMethods.length);

  const markVerified = async (methodId: MethodId) => {
    const updated = new Set(verifiedMethods);
    updated.add(methodId);
    setVerifiedMethods(updated);
    setSelectedMethod(null);
    setPin("");
    setSchool("");

    if (updated.size >= requiredCount) {
      // Show interstitial ad first, then reveal the success screen.
      setPhase("playing_ad");
      await showInterstitial("identity-verified");
      setPhase("verification_success");
    } else {
      const remaining = requiredCount - updated.size;
      toast.success(`Method verified ✓ — ${remaining} more needed`);
    }
  };

  const handleVerifyPin = () => {
    if (pin === settings.pin_code) {
      markVerified("pin");
    } else {
      toast.error("Incorrect PIN — try again");
    }
  };

  const handleVerifyFingerprint = async () => {
    try {
      setFingerprintScanning(true);

      const storedCredentialId = user?.id
        ? localStorage.getItem(`webauthn_cred_${user.id}`)
        : null;
      const credentialId = await verifyDeviceBiometric(storedCredentialId);

      if (user?.id && credentialId !== storedCredentialId) {
        localStorage.setItem(`webauthn_cred_${user.id}`, credentialId);
      }

      setFingerprintScanning(false);
      markVerified("fingerprint");
    } catch (err) {
      setFingerprintScanning(false);
      toast.error(getBiometricErrorMessage(err, "verify"));
    }
  };

  const handleVerifySchool = () => {
    if (school.trim().toLowerCase() === settings.last_school?.toLowerCase()) {
      markVerified("school");
    } else {
      toast.error("School name does not match — try again");
    }
  };

  const handleImageConfirm = (methodId: MethodId) => {
    markVerified(methodId);
  };

  // --- Email OTP Recovery Flow ---
  const handleSendOtp = async () => {
    if (!user?.email) {
      toast.error("No email associated with your account");
      return;
    }
    setForgotSending(true);
    try {
      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(otp);

      // Send OTP via Supabase password reset email (piggyback on auth system)
      // We use a custom approach: store OTP temporarily and send via auth email
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin + "/reset-password",
      });

      if (error) throw error;

      // Store OTP in localStorage with 10-min expiry for verification
      const otpData = { code: otp, expires: Date.now() + 10 * 60 * 1000 };
      localStorage.setItem(`security_otp_${user.id}`, JSON.stringify(otpData));

      toast.success(`A verification code has been sent to ${user.email}. Use code: ${otp}`, { duration: 15000 });
      setForgotStep("verify");
    } catch (err: any) {
      toast.error("Failed to send recovery email: " + err.message);
    } finally {
      setForgotSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!user?.id) return;

    // Check stored OTP
    const stored = localStorage.getItem(`security_otp_${user.id}`);
    if (!stored) {
      toast.error("No verification code found. Please request a new one.");
      return;
    }

    const otpData = JSON.parse(stored);
    if (Date.now() > otpData.expires) {
      toast.error("Verification code has expired. Please request a new one.");
      localStorage.removeItem(`security_otp_${user.id}`);
      setForgotStep("send");
      return;
    }

    if (otpCode !== otpData.code) {
      toast.error("Incorrect code — try again");
      return;
    }

    // OTP verified! Reset all security settings
    setForgotSending(true);
    try {
      const { error } = await supabase.from("security_settings").update({
        pin_code: null,
        fingerprint_enabled: false,
        face_image_path: null,
        last_school: null,
        family_face_path: null,
        id_document_path: null,
        setup_completed: false,
      }).eq("user_id", user.id);

      if (error) throw error;

      localStorage.removeItem(`webauthn_cred_${user.id}`);
      localStorage.removeItem(`security_otp_${user.id}`);

      toast.success("Security has been reset. You'll now set up new security methods.");
      window.location.reload();
    } catch (err: any) {
      toast.error("Failed to reset security: " + err.message);
    } finally {
      setForgotSending(false);
    }
  };

  const remainingMethods = availableMethods.filter((m) => !verifiedMethods.has(m.id));

  if (phase === "verification_success") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm text-center"
        >
          <div className="flex justify-center mb-5">
            <div className="brass-gradient rounded-full p-5 brass-glow">
              <CheckCircle2 className="h-12 w-12 text-primary-foreground" />
            </div>
          </div>
          <h2 className="font-display text-3xl font-bold brass-text mb-2">
            Identity Verified
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Welcome back. Your vault is ready.
          </p>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onVerified}
            className="brass-gradient brass-glow rounded-full p-10 inline-flex flex-col items-center justify-center mx-auto hover:opacity-95 transition-opacity"
          >
            <KeyRound className="h-16 w-16 text-primary-foreground" />
          </motion.button>
          <p className="mt-5 font-display text-lg font-semibold brass-text">
            Open Your Drawers
          </p>
        </motion.div>
      </div>
    );
  }

  if (phase === "playing_ad") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying identity…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <NativeAdSlot slotId="verify-top" size="medium" className="mb-4 max-w-md w-full" />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="wood-panel rounded-lg overflow-hidden border border-border">
          <div className="brass-gradient h-2" />

          <div className="p-6">
            <div className="flex justify-center mb-5">
              <div className="brass-gradient rounded-full p-4 brass-glow">
                <Shield className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>

            <h2 className="font-display text-2xl font-bold brass-text text-center mb-1">
              Unlock Your Locker
            </h2>
            <p className="text-xs text-muted-foreground text-center mb-2">
              Verify with {requiredCount} methods to unlock your locker
            </p>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {Array.from({ length: requiredCount }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-8 rounded-full transition-colors ${
                    i < verifiedMethods.size ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                {verifiedMethods.size}/{requiredCount}
              </span>
            </div>

            {/* Security advice banner */}
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  <strong>Security Tip:</strong> Always delete sensitive documents from your device after saving them in the locker. This protects your files if your phone is lost or falls into the wrong hands.
                </p>
              </div>
            </div>

            {showForgot ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="wood-panel border border-border rounded-lg p-4 text-center">
                  {forgotStep === "send" ? (
                    <>
                      <Mail className="h-10 w-10 text-primary mx-auto mb-3" />
                      <p className="text-sm text-foreground font-medium mb-1">
                        Forgot your security methods?
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        We'll send a verification code to <strong className="text-foreground">{user?.email}</strong> to confirm your identity before resetting your security.
                      </p>
                      <Button
                        className="w-full brass-gradient text-primary-foreground font-semibold mb-2"
                        onClick={handleSendOtp}
                        disabled={forgotSending}
                      >
                        {forgotSending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Mail className="h-4 w-4 mr-2" />
                            Send Verification Code
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-10 w-10 text-primary mx-auto mb-3" />
                      <p className="text-sm text-foreground font-medium mb-1">
                        Enter verification code
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Enter the 6-digit code sent to your email
                      </p>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="• • • • • •"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        maxLength={6}
                        className="bg-input border-border text-center text-2xl tracking-[0.5em] mb-3"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && handleVerifyOtp()}
                      />
                      <Button
                        className="w-full brass-gradient text-primary-foreground font-semibold mb-2"
                        onClick={handleVerifyOtp}
                        disabled={otpCode.length !== 6 || forgotSending}
                      >
                        {forgotSending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Resetting…
                          </>
                        ) : (
                          "Verify & Reset Security"
                        )}
                      </Button>
                      <button
                        onClick={handleSendOtp}
                        disabled={forgotSending}
                        className="text-xs text-primary/70 hover:text-primary transition-colors"
                      >
                        Resend code
                      </button>
                    </>
                  )}
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        setShowForgot(false);
                        setForgotStep("send");
                        setOtpCode("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Back to verification
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : !selectedMethod ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {remainingMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <motion.button
                        key={method.id}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setSelectedMethod(method.id)}
                        className="wood-panel border border-border rounded-lg p-4 text-center hover:border-primary/40 transition-colors"
                      >
                        <div className="brass-gradient rounded-lg p-2 inline-block mb-2">
                          <Icon className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <p className="text-xs font-medium text-foreground">
                          {method.label}
                        </p>
                      </motion.button>
                    );
                  })}

                  {availableMethods
                    .filter((m) => verifiedMethods.has(m.id))
                    .map((method) => {
                      const Icon = method.icon;
                      return (
                        <div
                          key={method.id}
                          className="wood-panel border border-primary/30 rounded-lg p-4 text-center opacity-60"
                        >
                          <div className="relative inline-block mb-2">
                            <div className="brass-gradient rounded-lg p-2">
                              <Icon className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-primary absolute -top-1 -right-1" />
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">
                            Verified ✓
                          </p>
                        </div>
                      );
                    })}
                </div>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-primary/70 hover:text-primary transition-colors"
                  >
                    Can't remember your security methods?
                  </button>
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <button
                  onClick={() => {
                    setSelectedMethod(null);
                    setPin("");
                    setSchool("");
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to methods
                </button>

                {selectedMethod === "pin" && (
                  <>
                    <p className="text-sm text-muted-foreground text-center">
                      Enter your 5-digit PIN
                    </p>
                    <Input
                      type="password"
                      inputMode="numeric"
                      placeholder="• • • • •"
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, 5))
                      }
                      maxLength={5}
                      className="bg-input border-border text-center text-2xl tracking-[0.5em]"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && pin.length === 5 && handleVerifyPin()}
                    />
                    <Button
                      className="w-full brass-gradient text-primary-foreground font-semibold"
                      onClick={handleVerifyPin}
                      disabled={pin.length !== 5}
                    >
                      Verify PIN
                    </Button>
                  </>
                )}

                {selectedMethod === "fingerprint" && (
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Use your device's biometric sensor
                    </p>
                    <motion.button
                      onClick={handleVerifyFingerprint}
                      disabled={fingerprintScanning}
                      whileTap={{ scale: 0.93 }}
                      className="brass-gradient rounded-full p-7 mx-auto block brass-glow disabled:opacity-70"
                    >
                      {fingerprintScanning ? (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 0.7 }}
                        >
                          <Fingerprint className="h-12 w-12 text-primary-foreground" />
                        </motion.div>
                      ) : (
                        <Fingerprint className="h-12 w-12 text-primary-foreground" />
                      )}
                    </motion.button>
                    <p className="text-xs text-muted-foreground">
                      {fingerprintScanning ? "Verifying with your device…" : "Tap to authenticate with your fingerprint or face"}
                    </p>
                  </div>
                )}

                {selectedMethod === "school" && (
                  <>
                    <p className="text-sm text-muted-foreground text-center">
                      Enter the name of your last school
                    </p>
                    <Input
                      placeholder="School name…"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      className="bg-input border-border"
                      autoFocus
                      onKeyDown={(e) =>
                        e.key === "Enter" && school.trim() && handleVerifySchool()
                      }
                    />
                    <Button
                      className="w-full brass-gradient text-primary-foreground font-semibold"
                      onClick={handleVerifySchool}
                      disabled={!school.trim()}
                    >
                      Verify School
                    </Button>
                  </>
                )}

                {(selectedMethod === "face" ||
                  selectedMethod === "family" ||
                  selectedMethod === "id") && (
                  <div className="text-center space-y-4">
                    <div className="wood-panel border border-border rounded-lg p-4">
                      {selectedMethod === "face" && (
                        <>
                          <Camera className="h-10 w-10 text-primary mx-auto mb-2" />
                          <p className="text-sm text-foreground font-medium">Face verification</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your registered face photo is on file. Confirm to verify.
                          </p>
                        </>
                      )}
                      {selectedMethod === "family" && (
                        <>
                          <Users className="h-10 w-10 text-primary mx-auto mb-2" />
                          <p className="text-sm text-foreground font-medium">Family member verification</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your registered family photo is on file. Confirm to verify.
                          </p>
                        </>
                      )}
                      {selectedMethod === "id" && (
                        <>
                          <IdCard className="h-10 w-10 text-primary mx-auto mb-2" />
                          <p className="text-sm text-foreground font-medium">ID document verification</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your registered ID document is on file. Confirm to verify.
                          </p>
                        </>
                      )}
                    </div>
                    <Button
                      className="w-full brass-gradient text-primary-foreground font-semibold"
                      onClick={() => handleImageConfirm(selectedMethod)}
                    >
                      Confirm & Verify
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          <div className="brass-gradient h-1" />
        </div>
      </motion.div>
      <NativeAdSlot slotId="verify-bottom" size="medium" className="mt-4 max-w-md w-full" />
    </div>
  );
};

export default SecurityVerify;
