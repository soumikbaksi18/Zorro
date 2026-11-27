import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, newGrantToken, newIdempotencyKey, sha256Hex } from "./crypto";

beforeAll(() => {
  process.env.ZORRO_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a grant token", () => {
    const token = newGrantToken();
    const sealed = encryptSecret(token, "agent-123");
    expect(sealed).not.toContain(token);
    expect(decryptSecret(sealed, "agent-123")).toBe(token);
  });

  it("produces a different ciphertext each time", () => {
    expect(encryptSecret("same", "a")).not.toBe(encryptSecret("same", "a"));
  });

  it("refuses to decrypt for a different agent", () => {
    const sealed = encryptSecret("secret", "agent-A");
    expect(() => decryptSecret(sealed, "agent-B")).toThrow();
  });

  it("detects tampering", () => {
    const sealed = encryptSecret("secret", "agent-A");
    const parts = sealed.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptSecret(parts.join("."), "agent-A")).toThrow();
  });

  it("rejects a wrong-length key", () => {
    const original = process.env.ZORRO_ENCRYPTION_KEY;
    process.env.ZORRO_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x", "a")).toThrow(/32 bytes/);
    process.env.ZORRO_ENCRYPTION_KEY = original;
  });
});

describe("tokens and keys", () => {
  it("grant tokens are ngt_-prefixed and unique", () => {
    const a = newGrantToken();
    expect(a).toMatch(/^ngt_[A-Za-z0-9_-]{43}$/);
    expect(newGrantToken()).not.toBe(a);
  });

  it("sha256Hex matches the Agent API credential format (64 hex chars)", () => {
    expect(sha256Hex("ngt_example")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("idempotency keys fit the Agent API rule (8–128 chars of [A-Za-z0-9._:-])", () => {
    expect(newIdempotencyKey("swap")).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });
});
