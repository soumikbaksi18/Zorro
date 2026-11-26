// Bot settings: shared by the API, the worker and the browser (no server imports here).

import { z } from "zod";

export const MIN_ZEC_TRADE = 0.00132; // smallest ZEC swap NEAR Intents accepts
export const MIN_USDC_TRADE = 1;

const Mode = z.enum(["paper", "live"]); // paper = simulate with real quotes, move no money
const Stable = z.enum(["usdc-base", "usdc-sol"]);
const Slippage = z.number().int().min(10).max(300); // basis points
const ZecAmount = z
  .string()
  .regex(/^\d+(\.\d{1,8})?$/, "Enter a ZEC amount")
  .refine((v) => Number(v) >= MIN_ZEC_TRADE, `At least ${MIN_ZEC_TRADE} ZEC`);

export const StopLossConfig = z.object({
  kind: z.literal("stop_loss"),
  mode: Mode,
  amountZec: ZecAmount,
  triggerPriceUsd: z.number().positive().max(1_000_000),
  sellTo: Stable,
  slippageBps: Slippage,
});

export const TrailingStopConfig = z.object({
  kind: z.literal("trailing_stop"),
  mode: Mode,
  amountZec: ZecAmount,
  trailPct: z.number().min(1).max(50),
  sellTo: Stable,
  slippageBps: Slippage,
});

export const SmartDcaConfig = z.object({
  kind: z.literal("smart_dca"),
  mode: Mode,
  buyUsd: z.number().min(MIN_USDC_TRADE).max(10_000),
  everyHours: z.number().int().min(1).max(24 * 31),
  payWith: Stable,
  /** Buy this much extra (in %) when price is `dipThresholdPct` below your average cost. */
  dipBoostPct: z.number().min(0).max(200),
  dipThresholdPct: z.number().min(1).max(50),
  maxBuys: z.number().int().min(1).max(1000).nullable(),
  slippageBps: Slippage,
});

/** Smallest ZEC per limit order we allow (NEAR Intents' floor is $0.10 per order). */
export const MIN_LIMIT_ZEC = 0.001;

export const TpLadderConfig = z
  .object({
    kind: z.literal("tp_ladder"),
    mode: Mode,
    amountZec: z.string().regex(/^\d+(\.\d{1,8})?$/, "Enter a ZEC amount"),
    firstPriceUsd: z.number().positive().max(1_000_000),
    stepPct: z.number().min(1).max(100),
    rungs: z.number().int().min(1).max(6),
    receive: Stable,
  })
  .refine((c) => Number(c.amountZec) / c.rungs >= MIN_LIMIT_ZEC, {
    message: `Each rung needs at least ${MIN_LIMIT_ZEC} ZEC`,
    path: ["amountZec"],
  });

export const GridConfig = z
  .object({
    kind: z.literal("grid"),
    mode: Mode,
    lowerUsd: z.number().positive().max(1_000_000),
    upperUsd: z.number().positive().max(1_000_000),
    levels: z.number().int().min(3).max(10),
    orderZec: z.string().regex(/^\d+(\.\d{1,8})?$/, "Enter a ZEC amount").refine((v) => Number(v) >= MIN_LIMIT_ZEC, `At least ${MIN_LIMIT_ZEC} ZEC per level`),
    quote: Stable,
  })
  .refine((c) => c.upperUsd >= c.lowerUsd * 1.02, { message: "The top of the range must be at least 2% above the bottom", path: ["upperUsd"] });

export const BotConfigSchema = z.discriminatedUnion("kind", [StopLossConfig, TrailingStopConfig, SmartDcaConfig, TpLadderConfig, GridConfig]);
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type BotKind = BotConfig["kind"];

/** One resting limit order a ladder or grid bot manages. */
export type LimitOrderState = {
  key: string; // stable id within the bot, e.g. "rung-1" or "grid-3-sell-2"
  level: number; // rung or grid level index
  side: "buy" | "sell";
  priceUsd: number;
  quantity: string; // ZEC, atomic units (what a sell spends / a buy receives)
  status: "pending" | "placing" | "open" | "partially_filled" | "filled" | "canceled" | "expired" | "failed";
  orderId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  /** For a grid sell placed after a buy fill: what that buy paid, to book the round-trip profit. */
  boughtAtUsd?: number;
};

/** What a bot remembers between ticks. */
export type BotState = {
  // Limit-order bots (take-profit ladder, grid)
  orders?: LimitOrderState[];
  gridLevels?: number[]; // grid prices, low → high
  roundTrips?: number;
  realizedUsd?: number; // grid profit booked from completed buy→sell round trips
  previewNote?: string; // one-time caveat logged for paper bots
  lastPriceUsd?: number;
  peakUsd?: number; // trailing stop
  nextRunAt?: string; // DCA
  buys?: number; // DCA
  spentUsd?: number; // DCA, USDC spent
  boughtZec?: number; // DCA, ZEC received
  soldZec?: number;
  receivedUsd?: number;
  completedAt?: string;
  lastError?: string;
  failures?: number; // consecutive failed live trades; the bot pauses at 3
  /** A live trade that was sent and isn't final yet. The worker polls it; never resent under a new key. */
  inFlight?: {
    idempotencyKey: string;
    side: "sell_zec" | "buy_zec";
    amountIn: string; // atomic units
    expectedOut: string; // atomic units, from the quote
    reason: string;
    sentAt: string;
  };
};

export const STABLE_LABEL: Record<z.infer<typeof Stable>, string> = {
  "usdc-base": "USDC on Base",
  "usdc-sol": "USDC on Solana",
};

export const BOT_LABEL: Record<BotKind, string> = {
  stop_loss: "Stop-loss",
  trailing_stop: "Trailing stop",
  smart_dca: "Smart DCA",
  tp_ladder: "Take-profit ladder",
  grid: "Grid",
};

/** Rung prices of a take-profit ladder: first price, then stepPct higher each time. */
export function ladderPrices(c: { firstPriceUsd: number; stepPct: number; rungs: number }): number[] {
  return Array.from({ length: c.rungs }, (_, i) => Math.round(c.firstPriceUsd * (1 + c.stepPct / 100) ** i * 100) / 100);
}

/** Evenly spaced grid prices from lowerUsd to upperUsd. */
export function gridPrices(c: { lowerUsd: number; upperUsd: number; levels: number }): number[] {
  const step = (c.upperUsd - c.lowerUsd) / (c.levels - 1);
  return Array.from({ length: c.levels }, (_, i) => Math.round((c.lowerUsd + step * i) * 100) / 100);
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** One-line plain-words description of a bot. */
export function describeBot(c: BotConfig): string {
  switch (c.kind) {
    case "stop_loss":
      return `Sell ${c.amountZec} ZEC for ${STABLE_LABEL[c.sellTo]} if ZEC falls to ${usd(c.triggerPriceUsd)}`;
    case "trailing_stop":
      return `Sell ${c.amountZec} ZEC for ${STABLE_LABEL[c.sellTo]} if ZEC drops ${c.trailPct}% from its peak`;
    case "smart_dca": {
      const every = c.everyHours % 24 === 0 ? `${c.everyHours / 24} day${c.everyHours === 24 ? "" : "s"}` : `${c.everyHours} hours`;
      const boost = c.dipBoostPct > 0 ? `, ${c.dipBoostPct}% more when ZEC is ${c.dipThresholdPct}%+ below your average` : "";
      return `Buy ${usd(c.buyUsd)} of ZEC every ${every} with ${STABLE_LABEL[c.payWith]}${boost}`;
    }
    case "tp_ladder": {
      const prices = ladderPrices(c);
      const each = Number(c.amountZec) / c.rungs;
      return c.rungs === 1
        ? `Sell ${c.amountZec} ZEC for ${STABLE_LABEL[c.receive]} at ${usd(prices[0])}`
        : `Sell ${c.amountZec} ZEC in ${c.rungs} steps of ${Number(each.toFixed(8))} ZEC, from ${usd(prices[0])} up to ${usd(prices.at(-1)!)}, for ${STABLE_LABEL[c.receive]}`;
    }
    case "grid":
      return `Trade ${c.orderZec} ZEC per level across ${c.levels} levels from ${usd(c.lowerUsd)} to ${usd(c.upperUsd)}, against ${STABLE_LABEL[c.quote]}: buy low, sell one level higher`;
  }
}
