// Take-profit ladder and grid: which limit orders should exist, as pure functions.
// No network or money here; the runner places, polls and cancels.

import { gridPrices, ladderPrices, type BotConfig, type LimitOrderState } from "./config";

type Ladder = Extract<BotConfig, { kind: "tp_ladder" }>;
type Grid = Extract<BotConfig, { kind: "grid" }>;

const ZEC_DECIMALS = 8;
const toAtomic = (zec: number) => String(Math.round(zec * 10 ** ZEC_DECIMALS));

/** Ladder: one sell per rung, the amount split evenly (the last rung takes any remainder). */
export function buildLadder(c: Ladder): LimitOrderState[] {
  const total = BigInt(toAtomic(Number(c.amountZec)));
  const each = total / BigInt(c.rungs);
  return ladderPrices(c).map((priceUsd, i) => ({
    key: `rung-${i + 1}`,
    level: i,
    side: "sell" as const,
    priceUsd,
    quantity: (i === c.rungs - 1 ? total - each * BigInt(c.rungs - 1) : each).toString(),
    status: "pending" as const,
  }));
}

/**
 * Grid: buys on the levels below the market, sells on the levels above,
 * and no order on the level closest to the market (the classic gap).
 */
export function buildGrid(c: Grid, marketUsd: number): { levels: number[]; orders: LimitOrderState[] } {
  const levels = gridPrices(c);
  let nearest = 0;
  levels.forEach((p, i) => {
    if (Math.abs(p - marketUsd) < Math.abs(levels[nearest] - marketUsd)) nearest = i;
  });
  const quantity = toAtomic(Number(c.orderZec));
  const orders: LimitOrderState[] = [];
  levels.forEach((priceUsd, i) => {
    if (i === nearest) return;
    const side = priceUsd < marketUsd ? "buy" : "sell";
    orders.push({ key: `grid-${i}-${side}-0`, level: i, side, priceUsd, quantity, status: "pending" });
  });
  return { levels, orders };
}

/**
 * After a grid order fills, the opposite order one level away:
 * a buy at level i → sell at i+1; a sell at level i → buy at i-1.
 * Null at the edges of the range, or if that level already has a live order.
 */
export function counterOrder(levels: number[], orders: LimitOrderState[], filled: LimitOrderState): LimitOrderState | null {
  const level = filled.side === "buy" ? filled.level + 1 : filled.level - 1;
  if (level < 0 || level >= levels.length) return null;
  const busy = orders.some((o) => o.level === level && ["pending", "placing", "open", "partially_filled"].includes(o.status));
  if (busy) return null;
  const side = filled.side === "buy" ? "sell" : "buy";
  const n = orders.filter((o) => o.level === level && o.side === side).length;
  return {
    key: `grid-${level}-${side}-${n}`,
    level,
    side,
    priceUsd: levels[level],
    quantity: filled.quantity,
    status: "pending",
    ...(side === "sell" ? { boughtAtUsd: filled.priceUsd } : {}),
  };
}

/** Paper trading: open orders the market price has reached (a sell at or above, a buy at or below). */
export function paperFills(orders: LimitOrderState[], marketUsd: number): LimitOrderState[] {
  return orders.filter(
    (o) => (o.status === "open" || o.status === "partially_filled") && (o.side === "sell" ? marketUsd >= o.priceUsd : marketUsd <= o.priceUsd),
  );
}

/**
 * Keep a price inside the policy's limit-order bound (100 bps): a sell may be at most 1% below
 * the market and a buy at most 1% above. Better-than-market prices are untouched. 0.9% leaves room for drift.
 */
export function clampToMarket(side: "buy" | "sell", priceUsd: number, marketUsd: number): number {
  const p = side === "sell" ? Math.max(priceUsd, marketUsd * 0.991) : Math.min(priceUsd, marketUsd * 1.009);
  return Math.round(p * 100) / 100;
}

/** Price as NEAR Intents wants it: a plain decimal string, no exponent, no trailing zeros. */
export function formatPrice(priceUsd: number): string {
  const s = priceUsd.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

/** Profit (USD) of a grid sell that closes a round trip, before fees. */
export function roundTripProfitUsd(o: LimitOrderState): number {
  if (o.side !== "sell" || o.boughtAtUsd === undefined) return 0;
  return ((o.priceUsd - o.boughtAtUsd) * Number(o.quantity)) / 10 ** ZEC_DECIMALS;
}
