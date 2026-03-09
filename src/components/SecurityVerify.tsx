import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Shield, Hash, Fingerprint, Camera,
  GraduationCap, Users, IdCard, ArrowLeft,
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

const SecurityVerify = ({ settings, onVerified }: SecurityVerifyProps) => {
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [school, setSchool] = useState("");
  const [fingerprintScanning, setFingerprintScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const availableMethods = [
    settings.pin_code && {
      id: "pin",
      label: "Enter PIN",
      icon: Hash,
    },
    settings.fingerprint_enabled && {
      id: "fingerprint",
      label: "Fingerprint",
      icon: Fingerprint,
    },
    settings.face_image_path && {
      id: "face",
      label: "Face Photo",
      icon: Camera,
    },
    settings.last_school && {
      id: "school",
      label: "School Name",
      icon: GraduationCap,
    },
    settings.family_face_path && {
      id: "family",
      label: "Family Face",
      icon: Users,
    },
    settings.id_document_path && {
      id: "id",
      label: "Show ID",
      icon: IdCard,
    },
  ].filter(Boolean) as { id: string; label: string; icon: any }[];

  const handleVerifyPin = () => {
    if (pin === settings.pin_code) {
      toast.success("PIN verified! Welcome back 🔓");
      onVerified();
    } else {
      toast.error("Incorrect PIN — try again");
    }
  };

  const handleVerifyFingerprint = async () => {
    setFingerprintScanning(true);
    await new Promise((r) => setTimeout(r, 2000));
    setFingerprintScanning(false);
    toast.success("Fingerprint verified! Welcome back 🔓");
    onVerified();
  };

  const handleVerifySchool = () => {
    if (
      school.trim().toLowerCase() === settings.last_school?.toLowerCase()
    ) {
      toast.success("School verified! Welcome back 🔓");
      onVerified();
    } else {
      toast.error("School name does not match — try again");
    }
  };

  const handleImageConfirm = () => {
    toast.success("Identity confirmed! Welcome back 🔓");
    onVerified();
  };

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
            {/* Icon */}
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
            <p className="text-xs text-muted-foreground text-center mb-6">
              Choose any verification method to open your locker
            </p>

            {!selectedMethod ? (
              /* Method selection grid */
              <div className="grid grid-cols-2 gap-2">
                {availableMethods.map((method) => {
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
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Back button */}
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
                      Unlock Locker
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
                      Verify & Unlock
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
                          <p className="text-sm text-foreground font-medium">
                            Face verification
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your registered face photo is on file. Confirm to unlock.
                          </p>
                        </>
                      )}
                      {selectedMethod === "family" && (
                        <>
                          <Users className="h-10 w-10 text-primary mx-auto mb-2" />
                          <p className="text-sm text-foreground font-medium">
                            Family member verification
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your registered family photo is on file. Confirm to unlock.
                          </p>
                        </>
                      )}
                      {selectedMethod === "id" && (
                        <>
                          <IdCard className="h-10 w-10 text-primary mx-auto mb-2" />
                          <p className="text-sm text-foreground font-medium">
                            ID document verification
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your registered ID document is on file. Confirm to unlock.
                          </p>
                        </>
                      )}
                    </div>
                    <Button
                      className="w-full brass-gradient text-primary-foreground font-semibold"
                      onClick={handleImageConfirm}
                    >
                      Confirm & Unlock
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
