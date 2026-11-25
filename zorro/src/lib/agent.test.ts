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

describe("buildPolicy", () => {
  const input = PolicyInputSchema.parse({
    dailyBudgetUsd: "50",
    withdrawZec: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK",
    withdrawUsdcBase: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D",
  });
  const policy = buildPolicy(input);

  it("lets bots trade automatically (no per-trade approval) within a daily USD budget", () => {
    expect(policy.owner_approval).toBe(false);
    expect(policy.frozen).toBe(false);
    expect(policy.actions).toEqual(["swap", "limit_order", "withdraw"]);
    expect(policy.budget).toEqual({ daily_usd: "50", weekly_usd: null, monthly_usd: null });
    expect(policy.max_actions_per_hour).toBe(20);
  });

  it("only allows withdrawals to the user's own addresses, on canonical chain names", () => {
    expect(policy.destinations).toEqual({
      mode: "only",
      list: [
        { action: "withdraw", chain: "zec", address: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK", memo: null },
        { action: "withdraw", chain: "base", address: "0x2527d02599ba641c19fea793cd0f167589a0f10d", memo: null },
      ],
    });
  });

  it("is confidential (required for limit orders) and caps limit-order deviation", () => {
    expect(policy.confidential).toBe(true);
    expect(policy.limit_order).toEqual({ max_deviation_bps: 100 });
  });

  it("rejects bad input", () => {
    expect(PolicyInputSchema.safeParse({ dailyBudgetUsd: "0", withdrawZec: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK" }).success).toBe(false);
    expect(PolicyInputSchema.safeParse({ dailyBudgetUsd: "50", withdrawZec: "not-an-address" }).success).toBe(false);
    expect(
      PolicyInputSchema.safeParse({ dailyBudgetUsd: "50", withdrawZec: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK", withdrawUsdcBase: "0x12" }).success,
    ).toBe(false);
  });
});
