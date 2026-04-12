interface DeviceBiometricUser {
  id?: string | null;
  email?: string | null;
}

type BiometricAction = "register" | "verify";

const BIOMETRIC_TIMEOUT_MS = 120000;

const WEB_AUTHN_ALGORITHMS: PublicKeyCredentialParameters[] = [
  { alg: -7, type: "public-key" },
  { alg: -257, type: "public-key" },
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

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return buffer;
};

const createUserHandle = (userId?: string | null): ArrayBuffer => {
  const encoded = new TextEncoder().encode(userId?.trim() || crypto.randomUUID());
  const trimmed = encoded.byteLength <= 64 ? encoded : encoded.slice(0, 64);
  const buffer = new ArrayBuffer(trimmed.byteLength);
  new Uint8Array(buffer).set(trimmed);
  return buffer;
};

const ensureBiometricSupport = async () => {
  if (!window.PublicKeyCredential) {
    throw new Error("Biometric authentication is not supported on this device");
  }

  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!available) {
    throw new Error("No biometric sensor found on this device.");
  }
};

const buildRequestOptions = (
  challenge: ArrayBuffer,
  storedCredentialId?: string | null,
): PublicKeyCredentialRequestOptions => ({
  challenge,
  timeout: BIOMETRIC_TIMEOUT_MS,
  userVerification: "preferred",
  ...(storedCredentialId
    ? {
        allowCredentials: [
          {
            id: decodeCredentialId(storedCredentialId),
            type: "public-key",
          },
        ],
      }
    : {}),
});

const tryAuthenticateExistingCredential = async (storedCredentialId?: string | null) => {
  const attempts = [null, storedCredentialId].filter(
    (value, index, values) => value !== undefined && values.indexOf(value) === index,
  );

  for (const attempt of attempts) {
    try {
      const credential = await navigator.credentials.get({
        publicKey: buildRequestOptions(createChallenge(), attempt),
      });

      if (credential instanceof PublicKeyCredential) {
        return encodeCredentialId(credential.rawId);
      }
    } catch {
      // Try the next strategy.
    }
  }

  return null;
};

export const registerDeviceBiometric = async (
  user: DeviceBiometricUser,
  storedCredentialId?: string | null,
) => {
  await ensureBiometricSupport();

  const existingCredentialId = await tryAuthenticateExistingCredential(storedCredentialId);
  if (existingCredentialId) {
    return { credentialId: existingCredentialId, reusedExisting: true };
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: createChallenge(),
      rp: { name: "DocLocker" },
      user: {
        id: createUserHandle(user.id),
        name: user.email || user.id || "user",
        displayName: user.email || "User",
      },
      pubKeyCredParams: WEB_AUTHN_ALGORITHMS,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "preferred",
        residentKey: "preferred",
      },
      timeout: BIOMETRIC_TIMEOUT_MS,
      attestation: "none",
    },
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Biometric registration did not complete.");
  }

  return {
    credentialId: encodeCredentialId(credential.rawId),
    reusedExisting: false,
  };
};

export const verifyDeviceBiometric = async (storedCredentialId?: string | null) => {
  await ensureBiometricSupport();

  const credentialId = await tryAuthenticateExistingCredential(storedCredentialId);
  if (!credentialId) {
    throw new Error(
      "This device does not have the registered biometric credential. Use another unlock method or relink biometrics in Security Settings.",
    );
  }

  return credentialId;
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
      ? "Biometric prompt was dismissed. Tap again and approve the device prompt."
      : "Biometric prompt was dismissed. Try again and approve the device prompt.";
  }

  if (name === "InvalidStateError") {
    return action === "register"
      ? "This device is already linked. Try the fingerprint option again."
      : "This device biometric needs to be retried. Tap again.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return action === "register"
    ? "Biometric registration failed."
    : "Biometric verification failed.";
};