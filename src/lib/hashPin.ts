// Deterministic per-user SHA-256 PIN hashing (browser SubtleCrypto).
// Salted with the user's auth uid so PINs are not stored in plaintext.
export async function hashPin(userId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
