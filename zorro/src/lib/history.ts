// Price history for the assistant's charts: Kraken public candles (no key), cached 5 minutes.

import { z } from "zod";
import { cached } from "./news";

export const CHART_ASSETS = ["ZEC", "BTC", "ETH", "SOL", "NEAR"] as const;
export type ChartAsset = (typeof CHART_ASSETS)[number];
export const CHART_RANGES = ["1d", "7d", "30d", "90d"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

const PAIR: Record<ChartAsset, string> = { ZEC: "ZECUSD", BTC: "XBTUSD", ETH: "ETHUSD", SOL: "SOLUSD", NEAR: "NEARUSD" };
const SPAN: Record<ChartRange, { days: number; minutes: number }> = {
  "1d": { days: 1, minutes: 15 },
  "7d": { days: 7, minutes: 60 },
  "30d": { days: 30, minutes: 240 },
  "90d": { days: 90, minutes: 1440 },
};

export type ChartPoint = { t: number; v: number }; // unix seconds, USD
export type AssetChart = { asset: ChartAsset; range: ChartRange; points: ChartPoint[]; first: number; last: number; changePct: number; high: number; low: number };

const KrakenResponse = z.object({ error: z.array(z.string()).optional(), result: z.record(z.string(), z.unknown()).optional() });

export function getAssetChart(asset: ChartAsset, range: ChartRange): Promise<AssetChart> {
  return cached(`chart:${asset}:${range}`, 5 * 60_000, async () => {
    const { days, minutes } = SPAN[range];
    const since = Math.floor(Date.now() / 1000) - days * 86_400;
    const res = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${PAIR[asset]}&interval=${minutes}&since=${since}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = KrakenResponse.parse(await res.json());
    if (body.error?.length) throw new Error(`Kraken: ${body.error.join(", ")}`);
    const candles = Object.entries(body.result ?? {}).find(([k]) => k !== "last")?.[1];
    if (!Array.isArray(candles)) throw new Error("No price history");
    const points = candles
      .map((c: unknown[]) => ({ t: Number(c[0]), v: Number(c[4]) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);
    if (points.length < 2) throw new Error("Not enough price history");
    const values = points.map((p) => p.v);
    const first = values[0];
    const last = values[values.length - 1];
    return { asset, range, points, first, last, changePct: ((last - first) / first) * 100, high: Math.max(...values), low: Math.min(...values) };
  });
}
