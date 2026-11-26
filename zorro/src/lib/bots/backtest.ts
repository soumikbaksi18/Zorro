// Backtesting: replay real ZEC price history through the SAME strategy code the live
// bots run (engine.evaluate for market-order bots, limit-planner for ladders and grids).
// Pure: no network, no money. Safe to run anywhere.

import type { BotConfig, BotState, LimitOrderState } from "./config";
import { evaluate, nextDcaRun } from "./engine";
import { buildGrid, buildLadder, counterOrder, paperFills, roundTripProfitUsd } from "./limit-planner";

/** Observed on NEAR Intents ZEC ⇄ USDC market quotes (~0.59%), rounded up. */
export const SWAP_FEE = 0.006;
/** 1Click's app fee on limit orders (20 bps). */
export const LIMIT_FEE = 0.002;

export type PricePoint = { time: number; value: number }; // unix seconds, USD

export type BacktestTrade = { time: number; side: "buy" | "sell"; priceUsd: number; zec: number; usd: number; note: string };

export type BacktestResult = {
  from: PricePoint;
  to: PricePoint;
  trades: BacktestTrade[];
  startValueUsd: number; // what you put in, valued at the start
  endValueUsd: number; // what the bot leaves you with, valued at the end
  holdValueUsd: number; // the same starting money, just held
  feesUsd: number;
  stats: { label: string; value: string }[];
  summary: string;
};

const ZEC = 1e8;
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0, minimumFractionDigits: n < 10 ? 2 : 0 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function backtest(config: BotConfig, points: PricePoint[]): BacktestResult {
  if (points.length < 2) throw new Error("Not enough price history to backtest");
  const from = points[0];
  const to = points[points.length - 1];
  const marketMove = `ZEC went from ${usd(from.value)} to ${usd(to.value)} (${pct((to.value / from.value - 1) * 100)})`;

  switch (config.kind) {
    case "stop_loss":
    case "trailing_stop":
      return stopBacktest(config, points, from, to, marketMove);
    case "smart_dca":
      return dcaBacktest(config, points, from, to, marketMove);
    case "tp_ladder":
    case "grid":
      return limitBacktest(config, points, from, to, marketMove);
  }
}

// ---------- Stop-loss / trailing stop ----------

function stopBacktest(config: Extract<BotConfig, { kind: "stop_loss" | "trailing_stop" }>, points: PricePoint[], from: PricePoint, to: PricePoint, marketMove: string): BacktestResult {
  const amount = Number(config.amountZec);
  let state: BotState = {};
  let zec = amount;
  let cash = 0;
  let fees = 0;
  const trades: BacktestTrade[] = [];

  for (const p of points) {
    const r = evaluate(config, state, p.value, new Date(p.time * 1000));
    state = r.state;
    if (r.decision.type === "sell_zec") {
      const gross = r.decision.amountZec * p.value;
      fees += gross * SWAP_FEE;
      cash += gross * (1 - SWAP_FEE);
      zec -= r.decision.amountZec;
      trades.push({ time: p.time, side: "sell", priceUsd: p.value, zec: r.decision.amountZec, usd: gross * (1 - SWAP_FEE), note: r.decision.reason });
      break; // stops sell once
    }
  }

  const start = amount * from.value;
  const end = zec * to.value + cash;
  const hold = amount * to.value;
  const t = trades[0];
  const summary = t
    ? `${marketMove}. The bot would have sold ${amount} ZEC on ${day(t.time)} at ${usd(t.priceUsd)}, leaving ${usd(end)} instead of ${usd(hold)} by holding: ${end >= hold ? `${usd(end - hold)} better` : `${usd(hold - end)} worse`} than doing nothing.`
    : `${marketMove}. The price never reached the trigger, so the bot would not have sold. Same result as holding: ${usd(hold)}.`;
  return {
    from, to, trades, startValueUsd: start, endValueUsd: end, holdValueUsd: hold, feesUsd: fees, summary,
    stats: [
      { label: "Sold", value: t ? `${day(t.time)} at ${usd(t.priceUsd)}` : "Never triggered" },
      { label: "Vs holding", value: `${end - hold >= 0 ? "+" : "−"}${usd(Math.abs(end - hold))}` },
      ...(config.kind === "trailing_stop" && state.peakUsd ? [{ label: "Peak seen", value: usd(state.peakUsd) }] : []),
    ],
  };
}

// ---------- Smart DCA ----------

function dcaBacktest(config: Extract<BotConfig, { kind: "smart_dca" }>, points: PricePoint[], from: PricePoint, to: PricePoint, marketMove: string): BacktestResult {
  let state: BotState = {};
  let fees = 0;
  const trades: BacktestTrade[] = [];

  for (const p of points) {
    const now = new Date(p.time * 1000);
    const r = evaluate(config, state, p.value, now);
    state = r.state;
    if (r.decision.type === "buy_zec") {
      const spend = r.decision.amountUsd;
      const got = (spend * (1 - SWAP_FEE)) / p.value;
      fees += spend * SWAP_FEE;
      state = { ...state, buys: (state.buys ?? 0) + 1, spentUsd: (state.spentUsd ?? 0) + spend, boughtZec: (state.boughtZec ?? 0) + got, nextRunAt: nextDcaRun(config.everyHours, now) };
      trades.push({ time: p.time, side: "buy", priceUsd: p.value, zec: got, usd: spend, note: r.decision.reason });
    }
    if (state.completedAt) break;
  }

  const spent = state.spentUsd ?? 0;
  const bought = state.boughtZec ?? 0;
  const end = bought * to.value;
  const hold = spent > 0 ? ((spent * (1 - SWAP_FEE)) / from.value) * to.value : 0; // the same money, all at the start
  const avg = bought > 0 ? spent / bought : 0;
  const summary =
    trades.length === 0
      ? `${marketMove}. No buys were due in this period.`
      : `${marketMove}. The bot would have bought ${trades.length} time${trades.length === 1 ? "" : "s"}, ${usd(spent)} in total at an average of ${usd(avg)}, worth ${usd(end)} at the end (${pct((end / spent - 1) * 100)}). Putting the same ${usd(spent)} in all at once at the start would be worth ${usd(hold)}.`;
  return {
    from, to, trades, startValueUsd: spent, endValueUsd: end, holdValueUsd: hold, feesUsd: fees, summary,
    stats: [
      { label: "Buys", value: String(trades.length) },
      { label: "Average price", value: bought > 0 ? usd(avg) : "—" },
      { label: "ZEC bought", value: bought.toFixed(5) },
      { label: "Vs all at once", value: `${end - hold >= 0 ? "+" : "−"}${usd(Math.abs(end - hold))}` },
    ],
  };
}

// ---------- Take-profit ladder / grid ----------

function limitBacktest(config: Extract<BotConfig, { kind: "tp_ladder" | "grid" }>, points: PricePoint[], from: PricePoint, to: PricePoint, marketMove: string): BacktestResult {
  let orders: LimitOrderState[];
  let levels: number[] = [];
  if (config.kind === "tp_ladder") {
    orders = buildLadder(config);
  } else {
    const g = buildGrid(config, from.value);
    orders = g.orders;
    levels = g.levels;
  }
  orders = orders.map((o) => ({ ...o, status: "open" }));

  // Starting money: the ZEC the sells need, plus the USDC the buys need.
  let zec = orders.filter((o) => o.side === "sell").reduce((s, o) => s + Number(o.quantity) / ZEC, 0);
  let cash = orders.filter((o) => o.side === "buy").reduce((s, o) => s + (Number(o.quantity) / ZEC) * o.priceUsd, 0);
  const startZec = zec;
  const startCash = cash;
  let fees = 0;
  let roundTrips = 0;
  let realized = 0;
  const trades: BacktestTrade[] = [];

  for (const p of points) {
    for (const o of paperFills(orders, p.value)) {
      const qty = Number(o.quantity) / ZEC;
      const gross = qty * o.priceUsd;
      fees += gross * LIMIT_FEE;
      o.status = "filled";
      if (o.side === "sell") {
        zec -= qty;
        cash += gross * (1 - LIMIT_FEE);
      } else {
        zec += qty;
        cash -= gross * (1 + LIMIT_FEE);
      }
      const profit = roundTripProfitUsd(o);
      if (profit) {
        roundTrips++;
        realized += profit;
      }
      trades.push({ time: p.time, side: o.side, priceUsd: o.priceUsd, zec: qty, usd: gross, note: profit ? `Round trip +${usd(profit)}` : "" });
      if (config.kind === "grid") {
        const counter = counterOrder(levels, orders, o);
        if (counter) orders.push({ ...counter, status: "open" });
      }
    }
  }

  const start = startZec * from.value + startCash;
  const end = zec * to.value + cash;
  const hold = startZec * to.value + startCash;
  const filled = trades.length;
  const summary =
    config.kind === "tp_ladder"
      ? `${marketMove}. ${filled === 0 ? "No rung's price was reached, so nothing would have sold." : `${filled} of ${orders.length} rungs would have filled, selling ${trades.reduce((s, t) => s + t.zec, 0).toFixed(4)} ZEC for ${usd(trades.reduce((s, t) => s + t.usd, 0))}.`} You'd end with ${usd(end)} versus ${usd(hold)} by just holding.`
      : `${marketMove}. The grid would have filled ${filled} order${filled === 1 ? "" : "s"} and completed ${roundTrips} round trip${roundTrips === 1 ? "" : "s"} (${usd(realized)} profit before fees). Overall you'd end with ${usd(end)} versus ${usd(hold)} by just holding the same ZEC and USDC.`;
  return {
    from, to, trades, startValueUsd: start, endValueUsd: end, holdValueUsd: hold, feesUsd: fees, summary,
    stats: [
      { label: "Orders filled", value: String(filled) },
      ...(config.kind === "grid" ? [{ label: "Round trips", value: `${roundTrips} (${usd(realized)})` }] : []),
      { label: "Starting money", value: `${startZec.toFixed(4)} ZEC + ${usd(startCash)}` },
      { label: "Vs holding", value: `${end - hold >= 0 ? "+" : "−"}${usd(Math.abs(end - hold))}` },
    ],
  };
}
