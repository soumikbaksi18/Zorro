import { describe, expect, it } from "vitest";
import { parsePaymentCode } from "./scan";

describe("parsePaymentCode", () => {
  it("reads ZIP-321 Zcash requests", () => {
    const r = parsePaymentCode("zcash:t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK?amount=0.25&label=Coffee");
    expect(r).toMatchObject({ coinKey: "zec", address: "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK", amount: "0.25", label: "Coffee" });
  });

  it("reads EIP-681 token transfers (USDC on Base)", () => {
    const r = parsePaymentCode(
      "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x2527D02599Ba641c19FEa793cD0F167589a0f10D&uint256=25000000",
    );
    expect(r).toMatchObject({ coinKey: "usdc-base", address: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D", amount: "25" });
  });

  it("reads native ETH requests by chain", () => {
    expect(parsePaymentCode("ethereum:0x2527D02599Ba641c19FEa793cD0F167589a0f10D@8453?value=1000000000000000")).toMatchObject({ coinKey: "eth-base", amount: "0.001" });
  });

  it("reads Solana Pay with and without a token", () => {
    expect(parsePaymentCode("solana:9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin?amount=12.5&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toMatchObject({
      coinKey: "usdc-sol",
      amount: "12.5",
    });
    expect(parsePaymentCode("solana:9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin?amount=0.1")).toMatchObject({ coinKey: "sol", amount: "0.1" });
  });

  it("reads BIP-21 bitcoin", () => {
    expect(parsePaymentCode("bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.0005")).toMatchObject({ coinKey: "btc", amount: "0.0005" });
  });

  it("offers coin choices for a plain address", () => {
    const evm = parsePaymentCode("0x2527D02599Ba641c19FEa793cD0F167589a0f10D");
    expect(evm?.coinKey).toBeNull();
    expect(evm?.candidates).toContain("usdc-base");
    expect(evm?.candidates).toContain("eth");
    expect(parsePaymentCode("TJRabPrwbZy45sbavfcjinPJC18kjpRTv8")?.candidates[0]).toBe("usdt-tron");
    expect(parsePaymentCode("t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK")?.coinKey).toBe("zec");
    expect(parsePaymentCode("alice.near")?.coinKey).toBe("near");
  });

  it("rejects junk and bad addresses", () => {
    expect(parsePaymentCode("hello world")).toBeNull();
    expect(parsePaymentCode("zcash:notanaddress?amount=1")).toBeNull();
    expect(parsePaymentCode("ethereum:0x123/transfer?address=0xnope")).toBeNull();
  });
});
