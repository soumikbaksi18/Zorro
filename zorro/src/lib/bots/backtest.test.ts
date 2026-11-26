import { describe, expect, it } from "vitest";
import { BotConfigSchema, type BotConfig } from "./config";
import { LIMIT_FEE, SWAP_FEE, backtest, type PricePoint } from "./backtest";

const HOUR = 3600;
const t0 = Date.UTC(2026, 10, 1) / 1000;
const series = (prices: number[]): PricePoint[] => prices.map((value, i) => ({ time: t0 + i * HOUR, value }));
const cfg = (c: object) => BotConfigSchema.parse(c) as BotConfig;

describe("backtest: stop-loss", () => {
  const bot = cfg({ kind: "stop_loss", mode: "paper", amountZec: "1", triggerPriceUsd: 900, sellTo: "usdc-base", slippageBps: 100 });

  it("sells once at the first price at or below the trigger, net of fees", () => {
    const r = backtest(bot, series([1000, 950, 890, 700, 600]));
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ side: "sell", priceUsd: 890 });
    expect(r.endValueUsd).toBeCloseTo(890 * (1 - SWAP_FEE));
    expect(r.holdValueUsd).toBe(600);
    expect(r.summary).toContain("better than doing nothing");
  });

  it("does nothing if the trigger is never reached", () => {
    const r = backtest(bot, series([1000, 980, 1020]));
    expect(r.trades).toHaveLength(0);
    expect(r.endValueUsd).toBe(r.holdValueUsd);
  });
});

describe("backtest: trailing stop", () => {
  it("sells after a 10% drop from the peak", () => {
    const bot = cfg({ kind: "trailing_stop", mode: "paper", amountZec: "1", trailPct: 10, sellTo: "usdc-base", slippageBps: 100 });
    const r = backtest(bot, series([800, 900, 1000, 950, 899, 700]));
    expect(r.trades[0]).toMatchObject({ priceUsd: 899 });
  });
});

describe("backtest: smart DCA", () => {
  it("buys on schedule, boosts on dips, and compares with buying all at once", () => {
    const bot = cfg({ kind: "smart_dca", mode: "paper", buyUsd: 10, everyHours: 2, payWith: "usdc-base", dipBoostPct: 100, dipThresholdPct: 10, maxBuys: null, slippageBps: 100 });
    // buys at hours 0, 2, 4: 1000, then 1000, then 800 (20% below the 1000 average → doubled)
    const r = backtest(bot, series([1000, 1000, 1000, 1000, 800, 800]));
    expect(r.trades.map((t) => t.usd)).toEqual([10, 10, 20]);
    expect(r.startValueUsd).toBe(40);
    expect(r.trades[2].zec).toBeCloseTo((20 * (1 - SWAP_FEE)) / 800);
  });
});

describe("backtest: take-profit ladder and grid", () => {
  it("fills ladder rungs at their limit price", () => {
    const bot = cfg({ kind: "tp_ladder", mode: "paper", amountZec: "0.02", firstPriceUsd: 1000, stepPct: 10, rungs: 2, receive: "usdc-base" });
    const r = backtest(bot, series([900, 1005, 1050, 1000]));
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ side: "sell", priceUsd: 1000 });
    expect(r.feesUsd).toBeCloseTo(0.01 * 1000 * LIMIT_FEE);
  });

  it("books grid round trips when the price swings through levels", () => {
    const bot = cfg({ kind: "grid", mode: "paper", lowerUsd: 600, upperUsd: 800, levels: 5, orderZec: "0.01", quote: "usdc-base" });
    // starts at 705 (gap at 700): dip to 640 fills buy@650 → sell@700; back to 710 fills it
    const r = backtest(bot, series([705, 640, 710]));
    expect(r.trades.map((t) => `${t.side}@${t.priceUsd}`)).toEqual(["buy@650", "sell@700"]);
    expect(r.stats.find((s) => s.label === "Round trips")?.value).toBe("1 ($0.50)");
  });

  it("refuses to run without enough history", () => {
    const bot = cfg({ kind: "stop_loss", mode: "paper", amountZec: "1", triggerPriceUsd: 900, sellTo: "usdc-base", slippageBps: 100 });
    expect(() => backtest(bot, series([1000]))).toThrow(/history/);
  });
});
