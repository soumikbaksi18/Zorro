// Prices for payments: every coin's USD price from NEAR Intents (the venue that converts it)
// and USD→INR. Cached in memory for a minute. Works in the web app and the worker alike.

import { tokens } from "./agent-api";
import { COINS, type Coin } from "./coins";

export type Rates = {
  /** USD price per whole coin, by coin key. Missing when NEAR Intents has no fresh price. */
  usd: Record<string, number>;
  usdInr: number;
  zecUsd: number;
  at: string;
};

let cache: { at: number; value: Promise<Rates> } | null = null;
let lastGoodInr = 84; // fallback if the FX source is down (shown values are estimates anyway)

async function load(): Promise<Rates> {
  const [list, fx] = await Promise.all([
    tokens(),
    fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR", { signal: AbortSignal.timeout(8_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ rates?: { INR?: number } }>) : null))
      .catch(() => null),
  ]);
  const usd: Record<string, number> = {};
  for (const c of COINS) {
    const t = list.find((x) => x.asset_id === c.assetId);
    if (t?.price) usd[c.key] = t.price;
  }
  if (!usd.zec) throw new Error("No ZEC price from NEAR Intents");
  if (fx?.rates?.INR) lastGoodInr = fx.rates.INR;
  return { usd, usdInr: lastGoodInr, zecUsd: usd.zec, at: new Date().toISOString() };
}

export function getRates(): Promise<Rates> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const value = load();
  cache = { at: Date.now(), value };
  value.catch(() => {
    if (cache?.value === value) cache = null;
  });
  return value;
}

export function priceOf(rates: Rates, c: Coin): number {
  const p = rates.usd[c.key];
  if (!p) throw new Error(`No fresh price for ${c.symbol} on ${c.chainName}`);
  return p;
}

/** Convert an amount in USD, INR or the coin itself into USD. */
export function toUsd(rates: Rates, amount: number, currency: "USD" | "INR" | "COIN" | "ZEC", c?: Coin): number {
  if (currency === "USD") return amount;
  if (currency === "INR") return amount / rates.usdInr;
  if (currency === "ZEC") return amount * rates.zecUsd;
  if (!c) throw new Error("Coin needed");
  return amount * priceOf(rates, c);
}
