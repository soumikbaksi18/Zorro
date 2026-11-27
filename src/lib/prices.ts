// Price data for Zorro.
// - ZEC/USD spot comes from NEAR Intents 1Click, the venue orders execute on,
//   so what the user sees matches what triggers use. CoinGecko is the fallback.
// - 24h change and chart history come from CoinGecko.

import { cacheLife } from "next/cache";
import { getTokens } from "./oneclick";
import { ZEC } from "./assets";

export type Spot = {
  zecUsd: number;
  change24hPct: number | null;
  source: "near-intents" | "coingecko";
  updatedAt: string;
};

export type HistoryRange = "1d" | "7d" | "30d" | "90d";
export type HistoryPoint = { time: number; value: number }; // time = unix seconds, value = USD

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

type CoinGeckoSimple = { zcash?: { usd?: number; usd_24h_change?: number } };

export async function getSpot(): Promise<Spot> {
  "use cache";
  cacheLife({ stale: 15, revalidate: 15, expire: 120 });

  const [tokens, gecko] = await Promise.allSettled([
    getTokens(),
    fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd&include_24hr_change=true",
    ) as Promise<CoinGeckoSimple>,
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

  return {
    zecUsd,
    change24hPct: geckoZec?.usd_24h_change ?? null,
    source,
    updatedAt,
  };
}

export async function getHistory(range: HistoryRange): Promise<HistoryPoint[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 3600 });

  // CoinGecko's free API rate-limits quickly; Kraken's public candles are the fallback.
  try {
    return await coingeckoHistory(range);
  } catch (geckoError) {
    try {
      return await krakenHistory(range);
    } catch {
      throw geckoError;
    }
  }
}

async function coingeckoHistory(range: HistoryRange): Promise<HistoryPoint[]> {
  const days = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 }[range];
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/coins/zcash/market_chart?vs_currency=usd&days=${days}`,
  )) as { prices?: [number, number][] };
  return toPoints((data.prices ?? []).map(([ms, price]) => [Math.floor(ms / 1000), price]));
}

/** Kraken ZEC/USD candle closes. At most 720 candles per call, so longer ranges use wider candles. */
async function krakenHistory(range: HistoryRange): Promise<HistoryPoint[]> {
  const { days, minutes } = {
    "1d": { days: 1, minutes: 15 },
    "7d": { days: 7, minutes: 60 },
    "30d": { days: 30, minutes: 60 },
    "90d": { days: 90, minutes: 240 },
  }[range];
  const since = Math.floor(Date.now() / 1000) - days * 86_400;
  const data = (await fetchJson(`https://api.kraken.com/0/public/OHLC?pair=ZECUSD&interval=${minutes}&since=${since}`)) as {
    error?: string[];
    result?: Record<string, unknown>;
  };
  if (data.error?.length) throw new Error(`Kraken: ${data.error.join(", ")}`);
  const candles = Object.entries(data.result ?? {}).find(([k]) => k !== "last")?.[1];
  if (!Array.isArray(candles)) throw new Error("Kraken: no candles");
  return toPoints(candles.map((c: [number, string, string, string, string]) => [c[0], Number(c[4])]));
}

function toPoints(rows: [number, number][]): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  let lastTime = -1;
  for (const [time, value] of rows) {
    if (time > lastTime && Number.isFinite(value) && value > 0) {
      points.push({ time, value });
      lastTime = time;
    }
  }
  if (points.length < 2) throw new Error("Not enough price history");
  return points;
}
