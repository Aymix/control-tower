import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashToken, last4, newToken } from "@/lib/crypto";

const key = Buffer.alloc(32, 7).toString("base64");

describe("encryptSecret / decryptSecret", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("github_pat_abc123", key);
    const b = encryptSecret("github_pat_abc123", key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe("github_pat_abc123");
  });
  it("fails with the wrong key or tampered data", () => {
    const ct = encryptSecret("secret", key);
    expect(() => decryptSecret(ct, Buffer.alloc(32, 9).toString("base64"))).toThrow();
    const tampered = Buffer.from(ct, "base64");
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptSecret(tampered.toString("base64"), key)).toThrow();
  });
});

describe("tokens", () => {
  it("hashes deterministically and shows only last 4", () => {
    const { token, hash } = newToken();
    expect(hashToken(token)).toBe(hash);
    expect(last4("github_pat_XYZ9")).toBe("XYZ9");
  });
});
