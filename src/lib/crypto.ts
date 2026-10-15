import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope: base64( iv[12] | tag[16] | ciphertext ).
 * The key is MASTER_KEY (32 bytes, base64).
 */
export function encryptSecret(plaintext: string, masterKeyB64: string): string {
  const key = keyFrom(masterKeyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(envelopeB64: string, masterKeyB64: string): string {
  const key = keyFrom(masterKeyB64);
  const buf = Buffer.from(envelopeB64, "base64");
  if (buf.length < 28) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function keyFrom(masterKeyB64: string): Buffer {
  const raw = Buffer.from(masterKeyB64, "base64");
  if (raw.length === 32) return raw;
  // Tolerate a non-base64 passphrase by hashing it; still 32 bytes.
  return createHash("sha256").update(masterKeyB64).digest();
}

export function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}

/** Opaque, URL-safe token + its sha256 for storage. */
export function newToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
