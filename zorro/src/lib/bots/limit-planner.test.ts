import { describe, expect, it } from "vitest";
import { BotConfigSchema, describeBot, type BotConfig } from "./config";
import { buildGrid, buildLadder, clampToMarket, counterOrder, formatPrice, paperFills, roundTripProfitUsd } from "./limit-planner";

const ladder = BotConfigSchema.parse({ kind: "tp_ladder", mode: "paper", amountZec: "0.1", firstPriceUsd: 800, stepPct: 10, rungs: 4, receive: "usdc-base" }) as Extract<BotConfig, { kind: "tp_ladder" }>;
const grid = BotConfigSchema.parse({ kind: "grid", mode: "paper", lowerUsd: 600, upperUsd: 800, levels: 5, orderZec: "0.01", quote: "usdc-base" }) as Extract<BotConfig, { kind: "grid" }>;

describe("take-profit ladder", () => {
  it("splits the amount into rungs at rising prices", () => {
    const orders = buildLadder(ladder);
    expect(orders.map((o) => o.priceUsd)).toEqual([800, 880, 968, 1064.8]);
    expect(orders.every((o) => o.side === "sell" && o.status === "pending")).toBe(true);
    expect(orders.reduce((s, o) => s + BigInt(o.quantity), BigInt(0))).toBe(BigInt(10_000_000)); // exactly 0.1 ZEC
  });
  it("gives the remainder to the last rung", () => {
    const three = BotConfigSchema.parse({ ...ladder, amountZec: "0.01", rungs: 3 }) as typeof ladder;
    expect(buildLadder(three).map((o) => o.quantity)).toEqual(["333333", "333333", "333334"]);
  });
  it("rejects rungs smaller than the minimum", () => {
    expect(BotConfigSchema.safeParse({ ...ladder, amountZec: "0.002", rungs: 4 }).success).toBe(false);
  });
});

describe("grid", () => {
  it("buys below the market, sells above, and leaves a gap at the nearest level", () => {
    const { levels, orders } = buildGrid(grid, 705);
    expect(levels).toEqual([600, 650, 700, 750, 800]);
    expect(orders.map((o) => `${o.side}@${o.priceUsd}`)).toEqual(["buy@600", "buy@650", "sell@750", "sell@800"]);
  });
  it("places the opposite order one level away after a fill, carrying the buy price", () => {
    const { levels, orders } = buildGrid(grid, 705);
    const buy = { ...orders[1], status: "filled" as const }; // buy @650
    const counter = counterOrder(levels, orders.map((o) => (o.key === buy.key ? buy : o)), buy)!;
    expect(counter).toMatchObject({ side: "sell", priceUsd: 700, level: 2, boughtAtUsd: 650 });
    expect(roundTripProfitUsd({ ...counter, status: "filled" })).toBeCloseTo(0.5); // (700-650) × 0.01
  });
  it("doesn't stack orders on a busy level or step outside the range", () => {
    const { levels, orders } = buildGrid(grid, 705);
    const sell = orders.find((o) => o.priceUsd === 750)!; // level 3; counter buy would go to level 2 (free)
    expect(counterOrder(levels, orders, { ...sell, status: "filled" })).toMatchObject({ side: "buy", level: 2 });
    const top = orders.find((o) => o.priceUsd === 800)!;
    expect(counterOrder(levels, orders, { ...top, side: "buy", status: "filled" })).toBeNull(); // no level above 800
    const low = orders.find((o) => o.priceUsd === 650)!;
    expect(counterOrder(levels, orders, { ...low, side: "sell", status: "filled" })).toBeNull(); // level 0 has a live buy
  });
  it("requires a range at least 2% wide", () => {
    expect(BotConfigSchema.safeParse({ ...grid, upperUsd: 605 }).success).toBe(false);
  });
});

describe("paper fills, price bound and formatting", () => {
  it("fills sells at or above and buys at or below the market", () => {
    const orders = buildLadder(ladder).map((o) => ({ ...o, status: "open" as const }));
    expect(paperFills(orders, 890).map((o) => o.priceUsd)).toEqual([800, 880]);
    const { orders: g } = buildGrid(grid, 705);
    expect(paperFills(g.map((o) => ({ ...o, status: "open" as const })), 640).map((o) => `${o.side}@${o.priceUsd}`)).toEqual(["buy@650"]);
  });
  it("keeps prices within 1% of the market on the costly side only", () => {
    expect(clampToMarket("sell", 650, 700)).toBe(693.7); // would sell too cheap → raised
    expect(clampToMarket("sell", 750, 700)).toBe(750); // above market: fine
    expect(clampToMarket("buy", 750, 700)).toBe(706.3); // would buy too dear → lowered
    expect(clampToMarket("buy", 650, 700)).toBe(650);
  });
  it("formats prices without exponents or trailing zeros", () => {
    expect(formatPrice(800)).toBe("800");
    expect(formatPrice(1064.8)).toBe("1064.8");
    expect(formatPrice(0.5)).toBe("0.5");
  });
  it("describes the new bots in plain words", () => {
    expect(describeBot(ladder)).toBe("Sell 0.1 ZEC in 4 steps of 0.025 ZEC, from $800 up to $1,064.8, for USDC on Base");
    expect(describeBot(grid)).toContain("across 5 levels from $600 to $800");
  });
});
