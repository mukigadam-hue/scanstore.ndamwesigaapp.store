// Persistent staging for files the user wants to "Save to Secure Vault"
// from the public flow. Uses localStorage with a TTL so the file survives
// auto-lock, sign-out/sign-in, and security verification.

const KEY = "pendingVaultFile_v2";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface PendingVaultFile {
  name: string;
  type: string;
  dataUrl: string;
}

interface Stored extends PendingVaultFile {
  savedAt: number;
}

export function setPendingVaultFile(f: PendingVaultFile) {
  try {
    const payload: Stored = { ...f, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("Could not stage vault file (storage full?)", e);
    throw e;
  }
}

export function getPendingVaultFile(): PendingVaultFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.dataUrl) return null;
    if (Date.now() - (parsed.savedAt || 0) > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { name: parsed.name, type: parsed.type, dataUrl: parsed.dataUrl };
  } catch {
    return null;
  }
}

export function clearPendingVaultFile() {
  try {
    localStorage.removeItem(KEY);
    // Also clear legacy session key in case older tabs are around
    sessionStorage.removeItem("pendingVaultFile");
  } catch { /* ignore */ }
}
