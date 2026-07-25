interface DeviceBiometricUser {
  id?: string | null;
  email?: string | null;
}

type BiometricAction = "register" | "verify";

const BIOMETRIC_TIMEOUT_MS = 60000;

const WEB_AUTHN_ALGORITHMS: PublicKeyCredentialParameters[] = [
  { alg: -7, type: "public-key" },   // ES256
  { alg: -257, type: "public-key" }, // RS256
];

const createChallenge = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(32);
  crypto.getRandomValues(new Uint8Array(buffer));
  return buffer;
};

const encodeCredentialId = (rawId: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(rawId);
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const decodeCredentialId = (encodedId: string): ArrayBuffer => {
  const binary = atob(encodedId);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
};

const createUserHandle = (userId?: string | null): ArrayBuffer => {
  const encoded = new TextEncoder().encode(userId?.trim() || crypto.randomUUID());
  const trimmed = encoded.byteLength <= 64 ? encoded : encoded.slice(0, 64);
  const buffer = new ArrayBuffer(trimmed.byteLength);
  new Uint8Array(buffer).set(trimmed);
  return buffer;
};

const isInCrossOriginFrame = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // Access denied = cross-origin frame
  }
};

const ensureBiometricSupport = async () => {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("Fingerprint isn't supported on this device or browser.");
  }
  if (!window.isSecureContext) {
    throw new Error("Fingerprint needs a secure (HTTPS) connection.");
  }
  // Only block if we're clearly in the Lovable in-app preview iframe.
  // Real installed apps / native WebViews / user's browser aren't cross-origin framed.
  if (isInCrossOriginFrame()) {
    throw new Error(
      "Fingerprint can't run inside the in-app preview. Open the app in your phone's browser or the installed app.",
    );
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      throw new Error("No fingerprint or face sensor detected on this device. Set one up in Settings, then try again.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("No fingerprint")) throw e;
    // Some old WebViews throw on the availability probe — allow the flow to continue and let the OS decide.
  }
};

const getRpId = (): string | undefined => {
  // Let the browser default to current effective domain — most reliable across
  // preview subdomains, custom domains, and Capacitor. Only override if needed.
  try {
    const host = window.location.hostname;
    // localhost / IPs — omit rpId (browser handles it).
    if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return undefined;
    return host;
  } catch {
    return undefined;
  }
};

export const registerDeviceBiometric = async (
  user: DeviceBiometricUser,
  storedCredentialId?: string | null,
) => {
  await ensureBiometricSupport();

  // If we already have a credential on this device, verify it instead of
  // creating a duplicate (Android returns InvalidStateError for duplicates).
  if (storedCredentialId) {
    try {
      const existing = await navigator.credentials.get({
        publicKey: {
          challenge: createChallenge(),
          timeout: BIOMETRIC_TIMEOUT_MS,
          userVerification: "required",
          rpId: getRpId(),
          allowCredentials: [{ id: decodeCredentialId(storedCredentialId), type: "public-key" }],
        },
      });
      if (existing instanceof PublicKeyCredential) {
        return { credentialId: encodeCredentialId(existing.rawId), reusedExisting: true };
      }
    } catch {
      // Fall through and create a new credential.
    }
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: createChallenge(),
      rp: { name: "DocLocker", id: getRpId() },
      user: {
        id: createUserHandle(user.id),
        name: user.email || user.id || "user",
        displayName: user.email || "User",
      },
      pubKeyCredParams: WEB_AUTHN_ALGORITHMS,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
        requireResidentKey: false,
      },
      timeout: BIOMETRIC_TIMEOUT_MS,
      attestation: "none",
    },
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Fingerprint registration did not complete. Try again.");
  }

  return { credentialId: encodeCredentialId(credential.rawId), reusedExisting: false };
};

export const verifyDeviceBiometric = async (storedCredentialId?: string | null) => {
  await ensureBiometricSupport();

  const attempt = async (useAllowList: boolean): Promise<string> => {
    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: createChallenge(),
      timeout: BIOMETRIC_TIMEOUT_MS,
      userVerification: "required",
      rpId: getRpId(),
    };
    if (useAllowList && storedCredentialId) {
      publicKey.allowCredentials = [
        { id: decodeCredentialId(storedCredentialId), type: "public-key" },
      ];
    }
    const credential = await navigator.credentials.get({ publicKey });
    if (!(credential instanceof PublicKeyCredential)) {
      throw new Error("Fingerprint verification did not complete.");
    }
    return encodeCredentialId(credential.rawId);
  };

  // First try with the stored credential (fastest path — direct prompt).
  if (storedCredentialId) {
    try {
      return await attempt(true);
    } catch {
      // Stored credential may have been wiped from the device keystore.
      // Fall back to a discoverable-credential prompt so the user can
      // pick any registered passkey on this device.
    }
  }
  // No stored credential OR the stored one failed — let the OS show a picker.
  return attempt(false);
};

export const getBiometricErrorMessage = (error: unknown, action: BiometricAction) => {
  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? (error as Error & { name?: string }).name
        : undefined;

  if (name === "NotAllowedError" || name === "AbortError") {
    return action === "register"
      ? "You cancelled the fingerprint prompt. Tap again and approve with your fingerprint."
      : "You cancelled the fingerprint prompt. Tap again and place your finger on the sensor.";
  }
  if (name === "InvalidStateError") {
    return action === "register"
      ? "This fingerprint is already registered for this app. Use it to unlock instead."
      : "Try the fingerprint again — the sensor didn't recognize the previous attempt.";
  }
  if (name === "NotSupportedError") {
    return "This device doesn't support fingerprint sign-in for this app.";
  }
  if (name === "SecurityError") {
    return "Fingerprint blocked by the browser. Open the app in your phone's browser or the installed app and try again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return action === "register" ? "Fingerprint registration failed." : "Fingerprint verification failed.";
};
