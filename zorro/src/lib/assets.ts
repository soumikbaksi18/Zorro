// NEAR Intents 1Click asset IDs used by Zorro.
// Verified against GET https://1click.chaindefuser.com/v0/tokens on 2026-11-25.

export const ZEC = {
  key: "zec",
  assetId: "nep141:zec.omft.near",
  symbol: "ZEC",
  chain: "zec",
  chainName: "Zcash",
  decimals: 8,
} as const;

export const STABLECOINS = [
  {
    key: "usdc-base",
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    symbol: "USDC",
    chain: "base",
    chainName: "Base",
    decimals: 6,
    // Used to build EIP-681 payment links
    evmChainId: 8453,
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    walletHint: "MetaMask, Coinbase Wallet or Rainbow",
  },
  {
    key: "usdc-sol",
    assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
    symbol: "USDC",
    chain: "sol",
    chainName: "Solana",
    decimals: 6,
    // Used to build Solana Pay links
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    walletHint: "Phantom, Solflare or Backpack",
  },
] as const;

export type Stablecoin = (typeof STABLECOINS)[number];
export type StablecoinKey = Stablecoin["key"];
export type Asset = typeof ZEC | Stablecoin;

export function getStablecoin(key: string): Stablecoin | undefined {
  return STABLECOINS.find((s) => s.key === key);
}

/** Smallest ZEC amount NEAR Intents accepts (from its "Amount is too low" error, 2026-11-25). */
export const MIN_ZEC = "0.00132";

/** Convert a human amount ("1.5") to base units ("150000000") without float errors. */
export function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid amount: ${amount}`);
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) throw new Error(`Too many decimals (max ${decimals})`);
  const units = BigInt(whole + frac.padEnd(decimals, "0"));
  return units.toString();
}

/** Convert base units ("150000000") back to a human string ("1.5"). */
export function fromBaseUnits(units: string, decimals: number): string {
  const value = BigInt(units);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
