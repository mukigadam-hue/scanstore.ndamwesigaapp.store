import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getBiometricErrorMessage, registerDeviceBiometric } from "@/lib/webauthn";
import {
  Shield, Hash, Fingerprint, Camera,
  GraduationCap, Users, IdCard, Check,
  ChevronDown, ChevronUp, KeyRound, X, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CompletedMethods {
  pin?: string;
  fingerprint?: boolean;
  face?: File;
  school?: string;
  family?: string;
  id?: File;
}

interface SecuritySetupProps {
  onComplete: () => void;
  onCancel?: () => void;
}

const METHODS = [
  { id: "pin", label: "5-Digit PIN Code", desc: "A 5-number personal code to unlock your locker", icon: Hash },
  { id: "fingerprint", label: "Fingerprint Scan", desc: "Register your device fingerprint sensor", icon: Fingerprint },
  { id: "face", label: "Your Face Photo", desc: "Upload a clear photo of your face", icon: Camera },
  { id: "school", label: "Any School You Attended or Like", desc: "Name any school you attended or simply like", icon: GraduationCap },
  { id: "family", label: "Family Member's Name you Like", desc: "Name of a family member you like and remember", icon: Users },
  { id: "id", label: "National ID / Driving Permit", desc: "Upload your government-issued identity document", icon: IdCard },
];

const SecuritySetup = ({ onComplete, onCancel }: SecuritySetupProps) => {
  const { user, signOut } = useAuth();
  const [completed, setCompleted] = useState<CompletedMethods>({});
  const [expanded, setExpanded] = useState<string | null>("pin");
  const [saving, setSaving] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [school, setSchool] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [fingerprintScanning, setFingerprintScanning] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const faceRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);

  const completedCount = Object.keys(completed).length;
  const canFinish = completedCount >= 3;

  const markDone = (id: string, value: any) => {
    setCompleted((prev) => ({ ...prev, [id]: value }));
    setExpanded(null);
  };

  const handlePinSet = () => {
    if (!/^\d{5}$/.test(pin)) {
      toast.error("PIN must be exactly 5 digits (numbers only)");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match — please re-enter");
      return;
    }
    markDone("pin", pin);
    toast.success("PIN registered ✓");
  };

  const handleFingerprintScan = async () => {
    try {
      setFingerprintScanning(true);

      const storedCredentialId = user?.id
        ? localStorage.getItem(`webauthn_cred_${user.id}`)
        : null;
      const { credentialId, reusedExisting } = await registerDeviceBiometric(
        { id: user?.id, email: user?.email },
        storedCredentialId,
      );

      if (user?.id) {
        localStorage.setItem(`webauthn_cred_${user.id}`, credentialId);
      }

      setFingerprintScanning(false);
      markDone("fingerprint", true);
      toast.success(
        reusedExisting
          ? "Fingerprint already linked on this device ✓"
          : "Fingerprint registered ✓ — Your device will remember this!",
      );
    } catch (err) {
      setFingerprintScanning(false);
      toast.error(getBiometricErrorMessage(err, "register"));
    }
  };

  const handleImageFile = (type: "face" | "id", file: File) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      setPreviews((prev) => ({ ...prev, [type]: reader.result as string }));
    reader.readAsDataURL(file);
    markDone(type, file);
    const labels: Record<string, string> = {
      face: "Face photo",
      id: "ID document",
    };
    toast.success(`${labels[type]} registered ✓`);
  };

  const handleFamilySet = () => {
    if (!familyName.trim()) {
      toast.error("Please enter a family member's name");
      return;
    }
    markDone("family", familyName.trim());
    toast.success("Family member name registered ✓");
  };

  const handleSchoolSet = () => {
    if (!school.trim()) {
      toast.error("Please enter your school name");
      return;
    }
    markDone("school", school.trim());
    toast.success("School registered ✓");
  };

  const uploadImage = async (file: File, path: string) => {
    const { error } = await supabase.storage
      .from("security_images")
      .upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const handleFinish = async () => {
    if (!user || !canFinish) return;
    setSaving(true);
    try {
      let faceImagePath: string | null = null;
      let idDocumentPath: string | null = null;

      if (completed.face instanceof File)
        faceImagePath = await uploadImage(completed.face, `${user.id}/face`);
      if (completed.id instanceof File)
        idDocumentPath = await uploadImage(completed.id, `${user.id}/id_doc`);

      const { hashPin } = await import("@/lib/hashPin");
      const pinHash = completed.pin ? await hashPin(user.id, completed.pin) : null;

      const { error } = await supabase.from("security_settings").upsert(
        {
          user_id: user.id,
          pin_hash: pinHash,
          fingerprint_enabled: completed.fingerprint ?? false,
          face_image_path: faceImagePath,
          last_school: completed.school ?? null,
          family_face_path: completed.family ?? null,
          id_document_path: idDocumentPath,
          setup_completed: true,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      toast.success("Your locker is now secured! 🔐");
      onComplete();
    } catch (err: any) {
      toast.error("Failed to save security settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="wood-panel rounded-lg overflow-hidden border border-border">
          <div className="brass-gradient h-2" />

          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="brass-gradient rounded-lg p-2">
                  <Shield className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold brass-text">
                    {onCancel ? "Security Settings" : "Secure Your Locker"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Register at least 3 of the 6 security methods below
                  </p>
                </div>
              </div>
              {onCancel ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Close
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBackConfirm(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{completedCount} of 6 methods registered</span>
                {!canFinish && (
                  <span className="text-primary">
                    {3 - completedCount} more needed
                  </span>
                )}
                {canFinish && (
                  <span className="text-accent">Ready to secure!</span>
                )}
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full brass-gradient rounded-full"
                  animate={{ width: `${(completedCount / 6) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Methods */}
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {METHODS.map((method) => {
                const Icon = method.icon;
                const isDone = method.id in completed;
                const isOpen = expanded === method.id;

                return (
                  <div key={method.id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/40 transition-colors"
                      onClick={() => setExpanded(isOpen ? null : method.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-1.5 rounded transition-colors", isDone ? "bg-accent/20" : "bg-secondary")}>
                          {isDone ? <Check className="h-4 w-4 text-accent" /> : <Icon className="h-4 w-4 text-primary" />}
                        </div>
                        <div>
                          <p className={cn("text-sm font-medium leading-tight", isDone ? "text-muted-foreground line-through" : "text-foreground")}>
                            {method.label}
                          </p>
                          {!isDone && <p className="text-xs text-muted-foreground">{method.desc}</p>}
                          {isDone && <p className="text-xs text-accent">Registered ✓</p>}
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="p-4 border-t border-border bg-secondary/20 space-y-3">
                            {method.id === "pin" && (
                              <>
                                <Input type="password" inputMode="numeric" placeholder="Enter 5-digit PIN" value={pin}
                                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 5))} maxLength={5}
                                  className="bg-input border-border text-center text-xl tracking-[0.5em]" autoFocus />
                                <Input type="password" inputMode="numeric" placeholder="Confirm PIN" value={confirmPin}
                                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 5))} maxLength={5}
                                  className="bg-input border-border text-center text-xl tracking-[0.5em]"
                                  onKeyDown={(e) => e.key === "Enter" && handlePinSet()} />
                                <Button size="sm" className="w-full brass-gradient text-primary-foreground" onClick={handlePinSet}>Register PIN</Button>
                              </>
                            )}

                            {method.id === "fingerprint" && (
                              <div className="text-center py-2">
                                <p className="text-xs text-muted-foreground mb-4">Place your finger on the device sensor</p>
                                <motion.button onClick={handleFingerprintScan} disabled={fingerprintScanning} whileTap={{ scale: 0.95 }}
                                  className="brass-gradient rounded-full p-5 mx-auto block brass-glow disabled:opacity-70">
                                  {fingerprintScanning ? (
                                    <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 0.7 }}>
                                      <Fingerprint className="h-10 w-10 text-primary-foreground" />
                                    </motion.div>
                                  ) : (
                                    <Fingerprint className="h-10 w-10 text-primary-foreground" />
                                  )}
                                </motion.button>
                                <p className="text-xs text-muted-foreground mt-3">
                                  {fingerprintScanning ? "Authenticating… hold still" : "Tap to register fingerprint"}
                                </p>
                              </div>
                            )}

                            {method.id === "face" && (
                              <>
                                {previews.face && <img src={previews.face} alt="Face preview" className="w-24 h-24 object-cover rounded-full mx-auto border-2 border-primary/30" />}
                                <input type="file" ref={faceRef} accept="image/*" capture="user" className="hidden"
                                  onChange={(e) => e.target.files?.[0] && handleImageFile("face", e.target.files[0])} />
                                <Button size="sm" className="w-full brass-gradient text-primary-foreground" onClick={() => faceRef.current?.click()}>
                                  <Camera className="h-4 w-4 mr-2" />Upload / Take Face Photo
                                </Button>
                              </>
                            )}

                            {method.id === "school" && (
                              <>
                                <Input placeholder="e.g. Makerere University" value={school} onChange={(e) => setSchool(e.target.value)}
                                  className="bg-input border-border" autoFocus onKeyDown={(e) => e.key === "Enter" && handleSchoolSet()} />
                                <Button size="sm" className="w-full brass-gradient text-primary-foreground" onClick={handleSchoolSet}>Register School</Button>
                              </>
                            )}

                            {method.id === "family" && (
                              <>
                                <Input placeholder="e.g. Grandma Sarah" value={familyName} onChange={(e) => setFamilyName(e.target.value)}
                                  className="bg-input border-border" autoFocus onKeyDown={(e) => e.key === "Enter" && handleFamilySet()} />
                                <Button size="sm" className="w-full brass-gradient text-primary-foreground" onClick={handleFamilySet}>
                                  <Users className="h-4 w-4 mr-2" />Register Family Member's Name
                                </Button>
                              </>
                            )}

                            {method.id === "id" && (
                              <>
                                {previews.id && <img src={previews.id} alt="ID preview" className="w-40 h-24 object-cover rounded-lg mx-auto border border-primary/30" />}
                                <input type="file" ref={idRef} accept="image/*,.pdf" className="hidden"
                                  onChange={(e) => e.target.files?.[0] && handleImageFile("id", e.target.files[0])} />
                                <Button size="sm" className="w-full brass-gradient text-primary-foreground" onClick={() => idRef.current?.click()}>
                                  <IdCard className="h-4 w-4 mr-2" />Upload ID / Passport / Driving Permit
                                </Button>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Finish */}
            <div className="mt-5">
              <Button
                className="w-full brass-gradient text-primary-foreground font-semibold py-5"
                disabled={!canFinish || saving}
                onClick={handleFinish}
              >
                {saving ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="mr-2">
                    <KeyRound className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                {canFinish
                  ? `Secure My Locker (${completedCount}/6 complete)`
                  : `Complete ${3 - completedCount} more method${3 - completedCount !== 1 ? "s" : ""} to continue`}
              </Button>
            </div>
          </div>

          <div className="brass-gradient h-1" />
        </div>
      </motion.div>

      <AlertDialog open={showBackConfirm} onOpenChange={setShowBackConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out and go back?</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't finished securing your locker. If you go back now, you'll be signed out and will need to complete security setup the next time you sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowBackConfirm(false);
                await signOut();
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SecuritySetup;
