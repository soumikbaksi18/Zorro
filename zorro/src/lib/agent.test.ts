import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isoCBOR } from "@simplewebauthn/server/helpers";

// passkeys.ts and agent-service.ts import next/headers and the database; stub them for unit tests.
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/db", () => ({ db: {}, schema: {} }));

const { spkiFromCose } = await import("./passkeys");
const { buildPolicy, PolicyInputSchema } = await import("./agent-service");

describe("spkiFromCose", () => {
  it("converts a P-256 COSE key to the same SPKI Node exports", () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
        [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
      ]),
    );
    const expected = publicKey.export({ format: "der", type: "spki" }).toString("base64url");
    expect(spkiFromCose(cose)).toBe(expected);
  });
});

describe("buildPolicy (payments)", () => {
  const input = PolicyInputSchema.parse({ dailyLimitUsd: "100", cashOutZec: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK" });
  const policy = buildPolicy(input);

  it("pays automatically (no per-payment approval) within a daily USD limit", () => {
    expect(policy.owner_approval).toBe(false);
    expect(policy.frozen).toBe(false);
    expect(policy.actions).toEqual(["swap", "withdraw", "transfer"]);
    expect(policy.budget).toEqual({ daily_usd: "100", weekly_usd: null, monthly_usd: null });
    expect(policy.max_actions_per_hour).toBe(20);
    expect(policy.confidential).toBe(true);
    expect(policy.limit_order).toBeUndefined();
  });

  it("only lets money leave to approved payees (here: the user's own Zcash wallet)", () => {
    expect(policy.destinations).toEqual({
      mode: "only",
      list: [{ action: "withdraw", chain: "zec", address: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK", memo: null }],
    });
    expect(buildPolicy(PolicyInputSchema.parse({ dailyLimitUsd: "50" })).destinations).toEqual({ mode: "only", list: [] });
  });

  it("allows every coin Zorro can pay in, and nothing else", () => {
    expect(policy.assets).toContain("nep141:zec.omft.near");
    expect(policy.assets).toContain("nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near");
    expect((policy.assets as string[]).length).toBe(13);
  });

  it("rejects bad input", () => {
    expect(PolicyInputSchema.safeParse({ dailyLimitUsd: "0" }).success).toBe(false);
    expect(PolicyInputSchema.safeParse({ dailyLimitUsd: "50", cashOutZec: "not-an-address" }).success).toBe(false);
  });
});
