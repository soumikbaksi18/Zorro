import { describe, expect, it } from "vitest";
import { BotConfigSchema, describeBot, type BotConfig, type BotState } from "./config";
import { distanceToTrigger, evaluate, nextDcaRun } from "./engine";

const now = new Date("2026-11-26T10:00:00Z");

const stopLoss: BotConfig = { kind: "stop_loss", mode: "paper", amountZec: "0.5", triggerPriceUsd: 600, sellTo: "usdc-base", slippageBps: 100 };
const trailing: BotConfig = { kind: "trailing_stop", mode: "paper", amountZec: "1", trailPct: 10, sellTo: "usdc-sol", slippageBps: 100 };
const dca: BotConfig = {
  kind: "smart_dca", mode: "paper", buyUsd: 20, everyHours: 168, payWith: "usdc-base",
  dipBoostPct: 50, dipThresholdPct: 10, maxBuys: 3, slippageBps: 100,
};

describe("stop-loss", () => {
  it("holds above the trigger", () => {
    expect(evaluate(stopLoss, {}, 650, now).decision.type).toBe("hold");
  });
  it("sells the configured amount at or below the trigger", () => {
    const { decision } = evaluate(stopLoss, {}, 600, now);
    expect(decision).toMatchObject({ type: "sell_zec", amountZec: 0.5 });
    expect(evaluate(stopLoss, {}, 590, now).decision.type).toBe("sell_zec");
  });
  it("never trades again once completed or while a trade is in flight", () => {
    expect(evaluate(stopLoss, { completedAt: now.toISOString() }, 500, now).decision.type).toBe("hold");
    const inFlight: BotState = { inFlight: { idempotencyKey: "k", side: "sell_zec", amountIn: "1", expectedOut: "1", reason: "", sentAt: "" } };
    expect(evaluate(stopLoss, inFlight, 500, now).decision.type).toBe("hold");
  });
});

describe("trailing stop", () => {
  it("tracks the peak and sells after a drop of trailPct from it", () => {
    let state: BotState = {};
    for (const price of [700, 750, 800, 780]) {
      const r = evaluate(trailing, state, price, now);
      expect(r.decision.type).toBe("hold");
      state = r.state;
    }
    expect(state.peakUsd).toBe(800);
    expect(evaluate(trailing, state, 721, now).decision.type).toBe("hold"); // stop is 720
    expect(evaluate(trailing, state, 720, now).decision).toMatchObject({ type: "sell_zec", amountZec: 1 });
  });
  it("reports the distance to the trigger", () => {
    const d = distanceToTrigger(trailing, { peakUsd: 800 }, 760)!;
    expect(d.triggerUsd).toBe(720);
    expect(d.pct).toBeCloseTo((40 / 760) * 100);
  });
});

describe("smart DCA", () => {
  it("buys immediately the first time", () => {
    expect(evaluate(dca, {}, 700, now).decision).toMatchObject({ type: "buy_zec", amountUsd: 20 });
  });
  it("waits until the next run", () => {
    const state: BotState = { buys: 1, nextRunAt: nextDcaRun(168, now), spentUsd: 20, boughtZec: 0.028 };
    expect(evaluate(dca, state, 700, now).decision.type).toBe("hold");
    const later = new Date(now.getTime() + 168 * 3_600_000);
    expect(evaluate(dca, state, 700, later).decision.type).toBe("buy_zec");
  });
  it("buys more on a dip below the average cost", () => {
    const state: BotState = { buys: 1, spentUsd: 20, boughtZec: 0.025 }; // average $800
    expect(evaluate(dca, state, 760, now).decision).toMatchObject({ amountUsd: 20 }); // only 5% below
    expect(evaluate(dca, state, 700, now).decision).toMatchObject({ amountUsd: 30 }); // 12.5% below → +50%
  });
  it("stops after maxBuys", () => {
    const r = evaluate(dca, { buys: 3 }, 700, now);
    expect(r.decision.type).toBe("hold");
    expect(r.state.completedAt).toBeDefined();
  });
});

describe("config validation and wording", () => {
  it("rejects amounts below the NEAR Intents minimum and bad slippage", () => {
    expect(BotConfigSchema.safeParse({ ...stopLoss, amountZec: "0.0001" }).success).toBe(false);
    expect(BotConfigSchema.safeParse({ ...stopLoss, slippageBps: 5000 }).success).toBe(false);
    expect(BotConfigSchema.safeParse(dca).success).toBe(true);
  });
  it("describes bots in plain words", () => {
    expect(describeBot(stopLoss)).toBe("Sell 0.5 ZEC for USDC on Base if ZEC falls to $600");
    expect(describeBot(trailing)).toContain("drops 10% from its peak");
    expect(describeBot(dca)).toBe("Buy $20 of ZEC every 7 days with USDC on Base, 50% more when ZEC is 10%+ below your average");
  });
});
