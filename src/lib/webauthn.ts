interface DeviceBiometricUser {
  id?: string | null;
  email?: string | null;
}

type BiometricAction = "register" | "verify";
type NativeBiometricResult = { credentialId: string; native: true };

const BIOMETRIC_TIMEOUT_MS = 60000;
const ANDROID_BIOMETRIC_CALLBACK_TIMEOUT_MS = 45000;

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

const isAndroidDevice = () => {
  try {
    return /Android/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
};

const nativeBridgeObjects = () => {
  if (typeof window === "undefined") return [];
  const candidates = [
    (window as any).Android,
    (window as any).WebViewGold,
    (window as any).NativeBridge,
    (window as any).BiometricBridge,
    (window as any).FingerprintBridge,
    (window as any).webkit?.messageHandlers?.biometric,
    (window as any).webkit?.messageHandlers?.fingerprint,
  ];
  return candidates.filter(Boolean);
};

const hasNativeBiometricBridge = () => {
  const methods = [
    "authenticateBiometric",
    "authenticateFingerprint",
    "biometricAuth",
    "fingerprintAuth",
    "requestBiometric",
    "requestFingerprint",
    "startBiometricAuth",
    "showBiometricPrompt",
    "verifyBiometric",
    "verifyFingerprint",
    "registerBiometric",
    "registerFingerprint",
    "postMessage",
  ];
  return nativeBridgeObjects().some((bridge) =>
    methods.some((method) => typeof bridge?.[method] === "function"),
  );
};

const normalizeNativeResult = (value: unknown): boolean | null => {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "success", "succeeded", "ok", "authenticated", "verified"].includes(normalized)) return true;
    if (["0", "false", "fail", "failed", "error", "cancel", "cancelled", "canceled", "denied"].includes(normalized)) return false;
    try {
      return normalizeNativeResult(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("success" in record) return normalizeNativeResult(record.success);
    if ("authenticated" in record) return normalizeNativeResult(record.authenticated);
    if ("verified" in record) return normalizeNativeResult(record.verified);
    if ("result" in record) return normalizeNativeResult(record.result);
    if ("status" in record) return normalizeNativeResult(record.status);
  }
  return null;
};

const makeNativeCredentialId = (user?: DeviceBiometricUser | null) => {
  const source = `android-native-biometric:${user?.id || user?.email || "local-user"}`;
  try {
    return btoa(unescape(encodeURIComponent(source)));
  } catch {
    return `android-native-biometric-${user?.id || "local-user"}`;
  }
};

const runNativeBiometric = (action: BiometricAction, user?: DeviceBiometricUser | null): Promise<NativeBiometricResult> => {
  if (!hasNativeBiometricBridge()) {
    return Promise.reject(new Error("Native biometric bridge unavailable."));
  }

  return new Promise((resolve, reject) => {
    const callbackNames = [
      "DocLockerBiometricResult",
      "onDocLockerBiometricResult",
      "onBiometricResult",
      "biometricCallback",
      "fingerprintCallback",
      "onFingerprintResult",
    ];
    let settled = false;
    let invokedBridge = false;

    const cleanup = () => {
      callbackNames.forEach((name) => {
        try {
          delete (window as any)[name];
        } catch {
          try { (window as any)[name] = undefined; } catch { /* ignore */ }
        }
      });
    };

    const finish = (value: unknown) => {
      if (settled) return;
      const ok = normalizeNativeResult(value);
      if (ok === null) return;
      settled = true;
      cleanup();
      if (ok) {
        resolve({ credentialId: makeNativeCredentialId(user), native: true });
      } else {
        reject(new DOMException("Fingerprint prompt was cancelled.", "NotAllowedError"));
      }
    };

    callbackNames.forEach((name) => {
      try {
        (window as any)[name] = finish;
      } catch { /* ignore */ }
    });

    const title = action === "register" ? "Register fingerprint" : "Verify fingerprint";
    const message = action === "register"
      ? "Use your phone fingerprint or face sensor to protect DocLocker."
      : "Use your phone fingerprint or face sensor to unlock DocLocker.";
    const payload = JSON.stringify({ action, title, message, callback: callbackNames[0] });
    const actionMethods = action === "register"
      ? ["registerBiometric", "registerFingerprint", "authenticateBiometric", "authenticateFingerprint", "biometricAuth", "fingerprintAuth", "requestBiometric", "requestFingerprint", "startBiometricAuth", "showBiometricPrompt", "verifyBiometric", "verifyFingerprint"]
      : ["authenticateBiometric", "authenticateFingerprint", "verifyBiometric", "verifyFingerprint", "biometricAuth", "fingerprintAuth", "requestBiometric", "requestFingerprint", "startBiometricAuth", "showBiometricPrompt"];

    for (const bridge of nativeBridgeObjects()) {
      for (const method of actionMethods) {
        try {
          if (settled || typeof bridge?.[method] !== "function") continue;
          invokedBridge = true;
          let result: unknown;
          try {
            result = bridge[method](title, message, callbackNames[0], payload);
          } catch {
            try {
              result = bridge[method](payload);
            } catch {
              result = bridge[method]();
            }
          }
          finish(result);
          if (settled) return;
        } catch {
          // Try the next bridge/method signature.
        }
      }
      try {
        if (!settled && typeof bridge?.postMessage === "function") {
          invokedBridge = true;
          bridge.postMessage(payload);
        }
      } catch { /* ignore */ }
    }

    if (!invokedBridge) {
      settled = true;
      cleanup();
      reject(new Error("Native biometric bridge unavailable."));
      return;
    }

    setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Fingerprint prompt did not respond. Try again."));
    }, ANDROID_BIOMETRIC_CALLBACK_TIMEOUT_MS);
  });
};

const ensureBiometricSupport = async () => {
  if (typeof window === "undefined") {
    throw new Error("Fingerprint isn't supported on this device or browser.");
  }
  if (!window.PublicKeyCredential && !hasNativeBiometricBridge()) {
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
  if (!window.PublicKeyCredential) return;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return;
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) {
      // Android WebViews often report false even when the OS biometric prompt
      // can still open through Credential Manager. Do not block old phones here;
      // let the real create/get call or native bridge decide.
      if (isAndroidDevice() || hasNativeBiometricBridge()) return;
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

const withRpId = <T extends Record<string, unknown>>(options: T, includeRpId: boolean): T => {
  if (!includeRpId) return options;
  const rpId = getRpId();
  if (!rpId) return options;
  return { ...options, rpId };
};

const getRpEntity = (includeRpId: boolean): PublicKeyCredentialRpEntity => {
  const rpId = includeRpId ? getRpId() : undefined;
  return rpId ? { name: "DocLocker", id: rpId } : { name: "DocLocker" };
};

export const registerDeviceBiometric = async (
  user: DeviceBiometricUser,
  storedCredentialId?: string | null,
) => {
  await ensureBiometricSupport();

  if (!window.PublicKeyCredential) {
    return runNativeBiometric("register", user);
  }

  // If we already have a credential on this device, verify it instead of
  // creating a duplicate (Android returns InvalidStateError for duplicates).
  if (storedCredentialId) {
    try {
      const existing = await navigator.credentials.get({
        publicKey: withRpId({
          challenge: createChallenge(),
          timeout: BIOMETRIC_TIMEOUT_MS,
          userVerification: "required",
          allowCredentials: [{ id: decodeCredentialId(storedCredentialId), type: "public-key" }],
        }, true),
      });
      if (existing instanceof PublicKeyCredential) {
        return { credentialId: encodeCredentialId(existing.rawId), reusedExisting: true };
      }
    } catch {
      // Fall through and create a new credential.
    }
  }

  const createOptions = (includeRpId: boolean, strictPlatform: boolean, verification: UserVerificationRequirement): PublicKeyCredentialCreationOptions => ({
      challenge: createChallenge(),
      rp: getRpEntity(includeRpId),
      user: {
        id: createUserHandle(user.id),
        name: user.email || user.id || "user",
        displayName: user.email || "User",
      },
      pubKeyCredParams: WEB_AUTHN_ALGORITHMS,
      authenticatorSelection: strictPlatform
        ? {
            authenticatorAttachment: "platform",
            userVerification: verification,
            residentKey: "preferred",
            requireResidentKey: false,
          }
        : {
            userVerification: verification,
            residentKey: "discouraged",
            requireResidentKey: false,
          },
      timeout: BIOMETRIC_TIMEOUT_MS,
      attestation: "none",
  });

  const attempts: PublicKeyCredentialCreationOptions[] = [
    createOptions(true, true, "required"),
    createOptions(false, true, "required"),
    createOptions(false, false, "required"),
    createOptions(false, false, "preferred"),
  ];

  let lastError: unknown;
  for (const publicKey of attempts) {
    try {
      const credential = await navigator.credentials.create({ publicKey });

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("Fingerprint registration did not complete. Try again.");
      }

      return { credentialId: encodeCredentialId(credential.rawId), reusedExisting: false };
    } catch (error) {
      lastError = error;
      const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "AbortError") break;
    }
  }

  if (isAndroidDevice() && hasNativeBiometricBridge()) {
    const nativeResult = await runNativeBiometric("register", user);
    return { credentialId: nativeResult.credentialId, reusedExisting: false };
  }

  throw lastError instanceof Error ? lastError : new Error("Fingerprint registration failed.");
};

export const verifyDeviceBiometric = async (storedCredentialId?: string | null) => {
  await ensureBiometricSupport();

  if (!window.PublicKeyCredential) {
    return (await runNativeBiometric("verify", null)).credentialId;
  }

  const attempt = async (
    useAllowList: boolean,
    includeRpId: boolean,
    verification: UserVerificationRequirement,
  ): Promise<string> => {
    const publicKey: PublicKeyCredentialRequestOptions = withRpId({
      challenge: createChallenge(),
      timeout: BIOMETRIC_TIMEOUT_MS,
      userVerification: verification,
    }, includeRpId);
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
      return await attempt(true, true, "required");
    } catch {
      try {
        return await attempt(true, false, "required");
      } catch {
        // Stored credential may have been wiped from the device keystore.
        // Fall back to a discoverable-credential prompt so the user can
        // pick any registered passkey on this device.
      }
    }
  }
  try {
    // No stored credential OR the stored one failed — let the OS show a picker.
    return await attempt(false, true, "required");
  } catch (firstError) {
    try {
      return await attempt(false, false, "required");
    } catch {
      try {
        return await attempt(false, false, "preferred");
      } catch (lastError) {
        if (isAndroidDevice() && hasNativeBiometricBridge()) {
          return (await runNativeBiometric("verify", null)).credentialId;
        }
        throw lastError instanceof Error ? lastError : firstError;
      }
    }
  }
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
    return "Fingerprint was blocked by this Android WebView. Update Android System WebView/Chrome, then open the app from the installed app or phone browser and try again.";
  }
  if (name === "UnknownError" || name === "ConstraintError") {
    return "Your phone refused the first fingerprint method. Tap again — the app will try the Android-compatible prompt.";
  }
  if (error instanceof Error && error.message) return error.message;
  return action === "register" ? "Fingerprint registration failed." : "Fingerprint verification failed.";
};
