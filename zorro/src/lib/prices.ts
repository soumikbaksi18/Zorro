// Price data for Zorro.
// - ZEC/USD spot comes from NEAR Intents 1Click, the venue orders execute on,
//   so what the user sees matches what triggers use. CoinGecko is the fallback.
// - 24h change and chart history come from CoinGecko.
// - USD/INR comes from Frankfurter (ECB reference rates).

import { cacheLife } from "next/cache";
import { getTokens } from "./oneclick";
import { ZEC } from "./assets";

export type Spot = {
  zecUsd: number;
  usdInr: number;
  change24hPct: number | null;
  source: "near-intents" | "coingecko";
  updatedAt: string;
};

export type HistoryRange = "1d" | "7d" | "30d";
export type HistoryPoint = { time: number; value: number }; // time = unix seconds, value = USD

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

type CoinGeckoSimple = { zcash?: { usd?: number; usd_24h_change?: number; inr?: number } };

export async function getSpot(): Promise<Spot> {
  "use cache";
  cacheLife({ stale: 15, revalidate: 15, expire: 120 });

  const [tokens, gecko, fx] = await Promise.allSettled([
    getTokens(),
    fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd,inr&include_24hr_change=true",
    ) as Promise<CoinGeckoSimple>,
    fetchJson("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR") as Promise<{
      rates?: { INR?: number };
    }>,
  ]);

  const zecToken =
    tokens.status === "fulfilled" ? tokens.value.find((t) => t.assetId === ZEC.assetId) : undefined;
  const geckoZec = gecko.status === "fulfilled" ? gecko.value.zcash : undefined;

  let zecUsd: number;
  let source: Spot["source"];
  let updatedAt: string;
  if (zecToken) {
    zecUsd = zecToken.price;
    source = "near-intents";
    updatedAt = zecToken.priceUpdatedAt;
  } else if (geckoZec?.usd) {
    zecUsd = geckoZec.usd;
    source = "coingecko";
    updatedAt = new Date().toISOString();
  } else {
    throw new Error("No ZEC price source available");
  }

  let usdInr = fx.status === "fulfilled" ? fx.value.rates?.INR : undefined;
  if (!usdInr && geckoZec?.inr && geckoZec.usd) usdInr = geckoZec.inr / geckoZec.usd;

  return {
    zecUsd,
    usdInr: usdInr ?? 0,
    change24hPct: geckoZec?.usd_24h_change ?? null,
    source,
    updatedAt,
  };
}

export async function getHistory(range: HistoryRange): Promise<HistoryPoint[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 3600 });

  const days = { "1d": 1, "7d": 7, "30d": 30 }[range];
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/coins/zcash/market_chart?vs_currency=usd&days=${days}`,
  )) as { prices?: [number, number][] };

  const points: HistoryPoint[] = [];
  let lastTime = -1;
  for (const [ms, price] of data.prices ?? []) {
    const time = Math.floor(ms / 1000);
    if (time > lastTime) {
      points.push({ time, value: price });
      lastTime = time;
    }
  }
  return points;
}
