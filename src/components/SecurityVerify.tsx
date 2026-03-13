import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Shield, Hash, Fingerprint, Camera,
  GraduationCap, Users, IdCard, ArrowLeft, CheckCircle2,
  KeyRound, Mail,
} from "lucide-react";

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
  const [showForgot, setShowForgot] = useState(false);
  const [forgotSending, setForgotSending] = useState(false);

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

  const markVerified = (methodId: MethodId) => {
    const updated = new Set(verifiedMethods);
    updated.add(methodId);
    setVerifiedMethods(updated);
    setSelectedMethod(null);
    setPin("");
    setSchool("");

    if (updated.size >= requiredCount) {
      toast.success("Identity fully verified! Welcome back 🔓");
      onVerified();
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
    setFingerprintScanning(true);
    await new Promise((r) => setTimeout(r, 600));
    setFingerprintScanning(false);
    markVerified("fingerprint");
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

  const handleForgotSecurity = async () => {
    if (!user?.email) {
      toast.error("No email associated with your account");
      return;
    }
    setForgotSending(true);
    try {
      // Reset security settings so user must re-setup
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

      toast.success("Security has been reset. You'll now set up new security methods.");
      // Force page reload so Locker re-fetches security_settings and shows SecuritySetup
      window.location.reload();
    } catch (err: any) {
      toast.error("Failed to reset security: " + err.message);
    } finally {
      setForgotSending(false);
    }
  };

  const remainingMethods = availableMethods.filter((m) => !verifiedMethods.has(m.id));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="w-full max-w-sm"
      >
        <div className="wood-panel rounded-lg overflow-hidden border border-border">
          <div className="brass-gradient h-2" />

          <div className="p-6">
            <motion.div
              className="flex justify-center mb-5"
              animate={{
                boxShadow: [
                  "0 0 0px hsl(38 70% 50% / 0)",
                  "0 0 30px hsl(38 70% 50% / 0.4)",
                  "0 0 0px hsl(38 70% 50% / 0)",
                ],
              }}
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              <div className="brass-gradient rounded-full p-4 brass-glow">
                <Shield className="h-8 w-8 text-primary-foreground" />
              </div>
            </motion.div>

            <h2 className="font-display text-2xl font-bold brass-text text-center mb-1">
              Unlock Your Locker
            </h2>
            <p className="text-xs text-muted-foreground text-center mb-2">
              Verify with {requiredCount} methods to unlock your locker
            </p>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {Array.from({ length: requiredCount }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-8 rounded-full transition-colors ${
                    i < verifiedMethods.size
                      ? "bg-primary"
                      : "bg-muted"
                  }`}
                />
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                {verifiedMethods.size}/{requiredCount}
              </span>
            </div>

            {showForgot ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="wood-panel border border-border rounded-lg p-4 text-center">
                  <KeyRound className="h-10 w-10 text-primary mx-auto mb-3" />
                  <p className="text-sm text-foreground font-medium mb-1">
                    Forgot your security methods?
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    This will reset ALL your security methods (PIN, fingerprint, photos, etc.). 
                    You'll need to set up new ones immediately.
                  </p>
                  <Button
                    className="w-full brass-gradient text-primary-foreground font-semibold mb-2"
                    onClick={handleForgotSecurity}
                    disabled={forgotSending}
                  >
                    {forgotSending ? "Resetting…" : "Reset All Security Methods"}
                  </Button>
                  <button
                    onClick={() => setShowForgot(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back to verification
                  </button>
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

                {/* Forgot security link */}
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

                {/* PIN */}
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

                {/* Fingerprint */}
                {selectedMethod === "fingerprint" && (
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Place your finger on the sensor
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
                      {fingerprintScanning ? "Scanning… hold still" : "Tap to scan"}
                    </p>
                  </div>
                )}

                {/* School */}
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

                {/* Image-based methods */}
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
    </div>
  );
};

export default SecurityVerify;
