import { describe, expect, it } from "vitest";
import { fromBaseUnits, toBaseUnits } from "./assets";
import { isEvmAddress, isSolanaAddress, zcashAddressKind } from "./addresses";
import { buildPaymentLink } from "./payment-links";

describe("base unit conversion", () => {
  it("converts without floating point errors", () => {
    expect(toBaseUnits("0.1", 8)).toBe("10000000");
    expect(toBaseUnits("1.23456789", 8)).toBe("123456789");
    expect(toBaseUnits("20", 6)).toBe("20000000");
    expect(fromBaseUnits("132000", 8)).toBe("0.00132");
    expect(fromBaseUnits("100000000", 8)).toBe("1");
  });

  it("rejects bad input", () => {
    expect(() => toBaseUnits("1.123456789", 8)).toThrow(/decimals/);
    expect(() => toBaseUnits("-1", 8)).toThrow();
    expect(() => toBaseUnits("1e5", 8)).toThrow();
  });
});

describe("address checks", () => {
  it("classifies Zcash addresses", () => {
    expect(zcashAddressKind("t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK")).toBe("transparent");
    expect(zcashAddressKind("u1" + "q".repeat(105))).toBe("unified");
    expect(zcashAddressKind("not-an-address")).toBeNull();
  });

  it("recognises EVM and Solana addresses", () => {
    expect(isEvmAddress("0x2527D02599Ba641c19FEa793cD0F167589a0f10D")).toBe(true);
    expect(isEvmAddress("0x123")).toBe(false);
    expect(isSolanaAddress("13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK")).toBe(true);
    expect(isSolanaAddress("0x2527D02599Ba641c19FEa793cD0F167589a0f10D")).toBe(false);
  });
});

describe("payment links", () => {
  it("builds a ZIP-321 link with the amount in ZEC", () => {
    expect(buildPaymentLink("zec", "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK", "1000000").uri).toBe(
      "zcash:t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK?amount=0.01",
    );
  });

  it("builds an EIP-681 USDC transfer on Base in base units", () => {
    const link = buildPaymentLink("usdc-base", "0x68206d1686D16582Db5184b65504df61460F2a1b", "5000000");
    expect(link.uri).toBe(
      "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x68206d1686D16582Db5184b65504df61460F2a1b&uint256=5000000",
    );
    expect(link.openUrl).toMatch(/^https:\/\/metamask\.app\.link\/send\//);
  });

  it("builds a Solana Pay USDC link with the amount in USDC", () => {
    expect(buildPaymentLink("usdc-sol", "Dk9VaFX5TxeJemb4QVMXPaoDawpLoaaSPWnifoSEKt4U", "5000000").uri).toBe(
      "solana:Dk9VaFX5TxeJemb4QVMXPaoDawpLoaaSPWnifoSEKt4U?amount=5&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&label=Zorro",
    );
  });
});
