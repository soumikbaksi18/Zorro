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

export const BotConfigSchema = z.discriminatedUnion("kind", [StopLossConfig, TrailingStopConfig, SmartDcaConfig]);
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type BotKind = BotConfig["kind"];

/** What a bot remembers between ticks. */
export type BotState = {
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
};

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
  }
}
