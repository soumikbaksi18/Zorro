// Read a scanned or pasted payment code: ZIP-321 (Zcash), EIP-681 (Ethereum, Base, Arbitrum),
// Solana Pay, BIP-21 (Bitcoin), or a plain address. Safe for the browser.

import { COIN_LIST as COINS, findCoin, fromUnits, isNearAccount, isValidAddress, type Coin } from "./coins";

export type ScanResult = {
  address: string;
  /** The coin the code asks for, when it says. Otherwise the coins this address could take. */
  coinKey: string | null;
  candidates: string[];
  amount: string | null; // human units of coinKey
  label: string | null;
};

const byKind = (kind: Coin["kind"]) => COINS.filter((c) => c.kind === kind).map((c) => c.key);

function query(s: string): URLSearchParams {
  const i = s.indexOf("?");
  return new URLSearchParams(i >= 0 ? s.slice(i + 1) : "");
}

const positive = (v: string | null) => (v && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 ? v : null);

export function parsePaymentCode(raw: string): ScanResult | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  // ZIP-321: zcash:<address>?amount=1.5&label=…
  if (lower.startsWith("zcash:")) {
    const body = text.slice(6);
    const address = body.split("?")[0];
    if (!isValidAddress("zec", address)) return null;
    const q = query(body);
    return { address, coinKey: "zec", candidates: ["zec"], amount: positive(q.get("amount")), label: q.get("label") ?? q.get("message") };
  }

  // EIP-681: ethereum:<token>@<chainId>/transfer?address=<to>&uint256=<units>  or  ethereum:<to>@<chainId>?value=<wei>
  if (lower.startsWith("ethereum:")) {
    const body = text.slice(9).replace(/^pay-/, "");
    const [target, rest = ""] = body.split("/");
    const [addr, chainPart] = target.split("?")[0].split("@");
    const chainId = Number(chainPart ?? 1) || 1;
    const q = query(rest || body);
    if (rest.startsWith("transfer")) {
      const to = q.get("address") ?? "";
      const c = COINS.find((x) => x.evmChainId === chainId && x.tokenAddress?.toLowerCase() === addr.toLowerCase());
      if (!isValidAddress("evm", to)) return null;
      const units = q.get("uint256");
      return {
        address: to,
        coinKey: c?.key ?? null,
        candidates: c ? [c.key] : byKind("evm"),
        amount: c && units && /^\d+$/.test(units) ? positive(fromUnits(units, c.decimals)) : null,
        label: null,
      };
    }
    if (!isValidAddress("evm", addr)) return null;
    const native = COINS.find((x) => x.evmChainId === chainId && !x.tokenAddress);
    const wei = q.get("value");
    return {
      address: addr,
      coinKey: native?.key ?? null,
      candidates: native ? [native.key] : byKind("evm"),
      amount: native && wei && /^\d+$/.test(wei) ? positive(fromUnits(wei, 18)) : null,
      label: null,
    };
  }

  // Solana Pay: solana:<recipient>?amount=1.5&spl-token=<mint>&label=…
  if (lower.startsWith("solana:")) {
    const body = text.slice(7);
    const address = body.split("?")[0];
    if (!isValidAddress("sol", address)) return null; // transaction-request links (https…) aren't supported
    const q = query(body);
    const mint = q.get("spl-token");
    const c = mint ? COINS.find((x) => x.mint === mint) : findCoin("sol");
    return { address, coinKey: c?.key ?? null, candidates: c ? [c.key] : byKind("sol"), amount: c ? positive(q.get("amount")) : null, label: q.get("label") };
  }

  // BIP-21: bitcoin:<address>?amount=0.001
  if (lower.startsWith("bitcoin:")) {
    const body = text.slice(8);
    const address = body.split("?")[0];
    if (!isValidAddress("btc", address)) return null;
    return { address, coinKey: "btc", candidates: ["btc"], amount: positive(query(body).get("amount")), label: query(body).get("label") };
  }

  // A plain address: the coins it could receive. Formats with a distinctive prefix win; Solana's
  // plain base58 would also match t1…, T… and 1…/3… addresses, so it only applies when nothing else does.
  const kind = (["zec", "evm", "tron", "btc", "sol"] as Coin["kind"][]).find((k) => isValidAddress(k, text));
  const candidates = kind ? byKind(kind) : [];
  if (candidates.length) {
    return { address: text, coinKey: candidates.length === 1 ? candidates[0] : null, candidates, amount: null, label: null };
  }
  if (isNearAccount(text) && text.includes(".")) return { address: text, coinKey: "near", candidates: ["near"], amount: null, label: null };
  return null;
}
