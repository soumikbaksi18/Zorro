// Lightweight address format checks. They catch typos and wrong-chain pastes
// before we ask for a quote; NEAR Intents does the authoritative validation.

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export type ZcashAddressKind = "unified" | "sapling" | "transparent";

export function zcashAddressKind(address: string): ZcashAddressKind | null {
  const a = address.trim();
  if (/^u1[02-9ac-hj-np-z]{100,}$/.test(a)) return "unified";
  if (/^zs1[02-9ac-hj-np-z]{75}$/.test(a)) return "sapling";
  if (/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return "transparent";
  return null;
}

export function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

export function isSolanaAddress(address: string): boolean {
  const a = address.trim();
  return a.length >= 32 && a.length <= 44 && BASE58.test(a);
}

export function isValidAddressForChain(chain: "zec" | "base" | "sol", address: string): boolean {
  if (chain === "zec") return zcashAddressKind(address) !== null;
  if (chain === "base") return isEvmAddress(address);
  return isSolanaAddress(address);
}

export function shortAddress(address: string, keep = 6): string {
  return address.length <= keep * 2 + 1 ? address : `${address.slice(0, keep)}…${address.slice(-keep)}`;
}
