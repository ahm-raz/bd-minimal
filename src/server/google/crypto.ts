import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Refresh tokens are stored encrypted (AES-256-GCM). The key is GOOGLE_TOKEN_KEY: 32 random bytes,
 * base64, server env only. Format "v1:<iv>:<tag>:<ciphertext>" (base64url), so the key can be rotated
 * later by adding "v2".
 */
function envKey(): Buffer {
  const k = Buffer.from(process.env.GOOGLE_TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes, base64");
  return k;
}

export function encryptToken(plain: string, key: Buffer = envKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(
    ":",
  );
}

/** Throws if the value was changed or a different key is used. */
export function decryptToken(enc: string, key: Buffer = envKey()): string {
  const [v, iv, tag, ct] = enc.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
