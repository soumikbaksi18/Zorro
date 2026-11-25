// Server-side secrets handling.
// Grant tokens let Zorro trade for a user's agent, so they are encrypted at rest
// with AES-256-GCM. The key comes from ZORRO_ENCRYPTION_KEY (32 random bytes, base64).
// Losing that key makes stored grants unusable (users would re-authorize), never funds.

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

const VERSION = "v1";

function encryptionKey(): Buffer {
  const raw = process.env.ZORRO_ENCRYPTION_KEY;
  if (!raw) throw new Error("ZORRO_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ZORRO_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a secret. `context` (e.g. the agent ID) is bound to the ciphertext:
 * decrypting with a different context fails, so a token can't be swapped onto another agent.
 */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string, context: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unrecognized ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** A new grant token. Only its SHA-256 hash is ever sent to the Agent API. */
export function newGrantToken(): string {
  return `ngt_${randomBytes(32).toString("base64url")}`;
}

/** Idempotency-Key for Agent API writes: 8–128 chars of [A-Za-z0-9._:-]. */
export function newIdempotencyKey(prefix = "zorro"): string {
  return `${prefix}-${randomUUID()}`;
}
