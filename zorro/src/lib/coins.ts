// Coins Zorro can pay out, receive and hold, each on one chain.
// Asset IDs verified against GET https://api.agentsonintents.com/v1/tokens on 2026-11-27.
// Safe for the browser: no secrets, no server imports.

import { zcashAddressKind } from "./addresses";

export type ChainKind = "zec" | "evm" | "sol" | "btc" | "near" | "tron";

export type Coin = {
  key: string;
  symbol: string;
  name: string;
  /** NEAR Intents chain id used for withdrawals and policy destinations. */
  chain: string;
  chainName: string;
  kind: ChainKind;
  assetId: string;
  decimals: number;
  /** EVM chain id and token contract (absent for native ETH), for EIP-681 links. */
  evmChainId?: number;
  tokenAddress?: string;
  /** Solana SPL mint (absent for native SOL), for Solana Pay links. */
  mint?: string;
};

export const COINS = [
  { key: "zec", symbol: "ZEC", name: "Zcash", chain: "zec", chainName: "Zcash", kind: "zec", assetId: "nep141:zec.omft.near", decimals: 8 },
  {
    key: "usdc-base",
    symbol: "USDC",
    name: "USD Coin",
    chain: "base",
    chainName: "Base",
    kind: "evm",
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    decimals: 6,
    evmChainId: 8453,
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    key: "usdc-sol",
    symbol: "USDC",
    name: "USD Coin",
    chain: "sol",
    chainName: "Solana",
    kind: "sol",
    assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
    decimals: 6,
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  {
    key: "usdc-eth",
    symbol: "USDC",
    name: "USD Coin",
    chain: "eth",
    chainName: "Ethereum",
    kind: "evm",
    assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
    decimals: 6,
    evmChainId: 1,
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    key: "usdc-arb",
    symbol: "USDC",
    name: "USD Coin",
    chain: "arb",
    chainName: "Arbitrum",
    kind: "evm",
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    decimals: 6,
    evmChainId: 42161,
    tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    key: "usdt-tron",
    symbol: "USDT",
    name: "Tether",
    chain: "tron",
    chainName: "Tron",
    kind: "tron",
    assetId: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near",
    decimals: 6,
  },
  {
    key: "usdt-eth",
    symbol: "USDT",
    name: "Tether",
    chain: "eth",
    chainName: "Ethereum",
    kind: "evm",
    assetId: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near",
    decimals: 6,
    evmChainId: 1,
    tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  {
    key: "usdt-sol",
    symbol: "USDT",
    name: "Tether",
    chain: "sol",
    chainName: "Solana",
    kind: "sol",
    assetId: "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near",
    decimals: 6,
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  { key: "sol", symbol: "SOL", name: "Solana", chain: "sol", chainName: "Solana", kind: "sol", assetId: "nep141:sol.omft.near", decimals: 9 },
  { key: "eth", symbol: "ETH", name: "Ether", chain: "eth", chainName: "Ethereum", kind: "evm", assetId: "nep141:eth.omft.near", decimals: 18, evmChainId: 1 },
  { key: "eth-base", symbol: "ETH", name: "Ether", chain: "base", chainName: "Base", kind: "evm", assetId: "nep141:base.omft.near", decimals: 18, evmChainId: 8453 },
  { key: "btc", symbol: "BTC", name: "Bitcoin", chain: "btc", chainName: "Bitcoin", kind: "btc", assetId: "nep141:btc.omft.near", decimals: 8 },
  { key: "near", symbol: "NEAR", name: "NEAR", chain: "near", chainName: "NEAR", kind: "near", assetId: "nep141:wrap.near", decimals: 24 },
] as const satisfies readonly Coin[];

/** The same list typed as plain Coin, for lookups by optional fields (chain id, token, mint). */
export const COIN_LIST: readonly Coin[] = COINS;

export type CoinKey = (typeof COINS)[number]["key"];
export const COIN_KEYS = COINS.map((c) => c.key) as [CoinKey, ...CoinKey[]];
export const ZEC_COIN = COINS[0];

export function coin(key: string): Coin {
  const c = COIN_LIST.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown coin ${key}`);
  return c;
}
export const findCoin = (key: string): Coin | undefined => COIN_LIST.find((x) => x.key === key);
export const coinByAssetId = (assetId: string): Coin | undefined => COIN_LIST.find((x) => x.assetId === assetId);
export const coinLabel = (c: Coin) => (c.kind === "zec" || c.symbol === c.chainName.toUpperCase() ? c.symbol : `${c.symbol} · ${c.chainName}`);

// ---------- Addresses ----------

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isValidAddress(kind: ChainKind, address: string): boolean {
  const a = address.trim();
  switch (kind) {
    case "zec":
      return zcashAddressKind(a) !== null;
    case "evm":
      return /^0x[0-9a-fA-F]{40}$/.test(a);
    case "sol":
      return a.length >= 32 && a.length <= 44 && BASE58.test(a);
    case "btc":
      return /^(bc1)[02-9ac-hj-np-z]{11,87}$/i.test(a) || (/^[13]/.test(a) && a.length >= 26 && a.length <= 35 && BASE58.test(a));
    case "tron":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
    case "near":
      return isNearAccount(a);
  }
}

/** A NEAR account: named (alice.near), implicit (64 hex) or EVM-style implicit (0x + 40 hex). */
export function isNearAccount(a: string): boolean {
  if (/^[0-9a-f]{64}$/.test(a) || /^0x[0-9a-f]{40}$/.test(a)) return true;
  return a.length >= 2 && a.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(a);
}

/** Canonical spelling for policy destinations (EVM addresses are compared lowercase). */
export function canonicalAddress(kind: ChainKind, address: string): string {
  const a = address.trim();
  return kind === "evm" ? a.toLowerCase() : a;
}

// ---------- Amounts ----------

/** Human amount ("1.5") → base units ("150000000"), no float errors. Extra decimals are cut. */
export function toUnits(amount: string, decimals: number): string {
  const t = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`Invalid amount: ${amount}`);
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole + frac.slice(0, decimals).padEnd(decimals, "0")).toString();
}

/** Base units → human string ("1.5"). */
export function fromUnits(units: string, decimals: number): string {
  const v = BigInt(units);
  const base = BigInt(10) ** BigInt(decimals);
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${v / base}.${frac}` : (v / base).toString();
}

/** A float → a decimal string with at most `decimals` places, rounded UP (never short-pay). */
export function ceilDecimal(value: number, decimals: number): string {
  const places = Math.min(decimals, 8);
  const f = 10 ** places;
  return (Math.ceil(value * f - 1e-9) / f).toFixed(places).replace(/\.?0+$/, "") || "0";
}

/** Short display amount: up to 6 significant decimals for small numbers. */
export function displayAmount(amount: string | number, max = 6): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return String(amount);
  if (n === 0) return "0";
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : max;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

// ---------- Payment links (a payer's wallet opens these) ----------

/** Standard payment URI for paying `amountUnits` of `c` to `address`, or null when the chain has none. */
export function paymentUri(c: Coin, address: string, amountUnits: string): string | null {
  const human = fromUnits(amountUnits, c.decimals);
  switch (c.kind) {
    case "zec":
      return `zcash:${address}?amount=${human}`; // ZIP-321
    case "evm":
      return c.tokenAddress
        ? `ethereum:${c.tokenAddress}@${c.evmChainId}/transfer?address=${address}&uint256=${amountUnits}` // EIP-681 token
        : `ethereum:${address}@${c.evmChainId}?value=${amountUnits}`; // EIP-681 native
    case "sol":
      return `solana:${address}?amount=${human}${c.mint ? `&spl-token=${c.mint}` : ""}&label=Zorro`; // Solana Pay
    case "btc":
      return `bitcoin:${address}?amount=${human}`; // BIP-21
    default:
      return null;
  }
}
