// Take-profit ladders and grids: place, follow, re-arm and cancel resting limit orders.
// Server-side only. Called by runner.ts once per tick for each active ladder/grid bot.
//
// Live safety rules (same spirit as market-order bots):
// - Every order is previewed first; anything NEAR Intents would refuse is not placed.
// - One placement per wallet at a time, saved with its Idempotency-Key before it's sent;
//   an unconfirmed placement is resent with the SAME key, never a new one.
// - Prices are kept within the policy's 1% bound using the REAL market price (never the demo price).

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { STABLECOINS, ZEC } from "../assets";
import {
  AgentApiError,
  FINAL_STATUSES,
  cancelLimitOrder,
  getLimitOrder,
  operationStatus,
  placeLimitOrder,
  previewLimitOrder,
  tokens,
  type LimitOrderBody,
} from "../agent-api";
import { newIdempotencyKey } from "../crypto";
import type { BotConfig, BotState, LimitOrderState } from "./config";
import { buildGrid, buildLadder, clampToMarket, counterOrder, formatPrice, paperFills, roundTripProfitUsd } from "./limit-planner";
import { NON_BLOCKING_WARNINGS, addEvent, agentHasOpenTrade, grantTokenFor, saveBot, type BotRow } from "./runner";

type LimitConfig = Extract<BotConfig, { kind: "tp_ladder" | "grid" }>;
const LIVE = new Set<LimitOrderState["status"]>(["open", "partially_filled"]);

const zec = (atomic: string) => Number(atomic) / 1e8;
const describe = (o: LimitOrderState) => `${o.side === "sell" ? "Sell" : "Buy"} ${zec(o.quantity)} ZEC at $${o.priceUsd.toFixed(2)}`;
const stableFor = (c: LimitConfig) => STABLECOINS.find((s) => s.key === (c.kind === "tp_ladder" ? c.receive : c.quote))!;

function orderBody(c: LimitConfig, o: LimitOrderState): LimitOrderBody {
  return { base_asset: ZEC.assetId, quote_asset: stableFor(c).assetId, side: o.side, quantity: o.quantity, price: formatPrice(o.priceUsd) };
}

async function realZecPrice(): Promise<number | null> {
  const t = (await tokens().catch(() => [])).find((x) => x.asset_id === ZEC.assetId);
  return t?.price ?? null;
}

export async function processLimitBot(
  bot: BotRow,
  config: LimitConfig,
  state: BotState,
  price: { priceUsd: number; source: string },
  now: Date,
  busyAgents: Set<string>,
): Promise<string | null> {
  const next: BotState = { ...state, lastPriceUsd: price.priceUsd };

  // First tick: plan the orders.
  if (!next.orders) {
    if (config.kind === "tp_ladder") {
      next.orders = buildLadder(config);
    } else {
      // A grid is laid out around the real market, so live orders start on the right side of it.
      const market = config.mode === "live" ? ((await realZecPrice()) ?? price.priceUsd) : price.priceUsd;
      const g = buildGrid(config, market);
      next.orders = g.orders;
      next.gridLevels = g.levels;
    }
    await saveBot(bot.id, next);
    await addEvent(bot.id, "info", `Planned ${next.orders.length} order${next.orders.length === 1 ? "" : "s"}: ${next.orders.map(describe).join("; ")}.`);
    return "planned";
  }

  return config.mode === "paper" ? paperTick(bot, config, next, price, now) : liveTick(bot, config, next, now, busyAgents);
}

// ---------- Fills (shared by paper and live) ----------

/** Book a fill: log it, record grid profit, and for a grid queue the opposite order. */
async function onFilled(bot: BotRow, config: LimitConfig, state: BotState, o: LimitOrderState, paper: boolean, correlationId: string | null = null) {
  const tag = paper ? "[Paper] " : "";
  const stable = stableFor(config);
  const quote = (zec(o.quantity) * o.priceUsd).toFixed(2);
  const profit = roundTripProfitUsd(o);
  if (profit) {
    state.realizedUsd = (state.realizedUsd ?? 0) + profit;
    state.roundTrips = (state.roundTrips ?? 0) + 1;
  }
  await addEvent(
    bot.id,
    "trade",
    `${tag}Filled: ${describe(o)} (${o.side === "sell" ? `→ ${quote} ${stable.symbol}` : `for ${quote} ${stable.symbol}`}).${profit ? ` Round trip profit ~$${profit.toFixed(2)} before fees.` : ""}`,
    {},
    correlationId,
  );
  if (config.kind === "grid" && state.gridLevels) {
    const counter = counterOrder(state.gridLevels, state.orders!, o);
    if (counter) {
      state.orders!.push(counter);
      await addEvent(bot.id, "info", `${tag}Re-arming the grid: ${describe(counter)}.`);
    }
  }
}

function ladderDone(config: LimitConfig, state: BotState): boolean {
  return config.kind === "tp_ladder" && state.orders!.every((o) => o.status === "filled");
}

// ---------- Paper ----------

async function paperTick(bot: BotRow, config: LimitConfig, state: BotState, price: { priceUsd: number }, now: Date): Promise<string | null> {
  const orders = state.orders!;
  let action: string | null = null;

  // One-time note on whether a live bot could place these right now.
  if (!state.previewNote) {
    const first = orders.find((o) => o.status === "pending");
    const preview = first ? await previewLimitOrder(bot.agentId, orderBody(config, first)).catch(() => null) : null;
    const refusals = (preview?.warnings ?? []).map((w) => w.code).filter((c) => !NON_BLOCKING_WARNINGS.has(c));
    state.previewNote = refusals.length ? refusals.join(", ") : "ok";
    if (refusals.length) {
      await addEvent(bot.id, "info", `[Paper] Note: a live bot would be refused right now (${refusals.join(", ").replaceAll("_", " ")}).`);
    }
  }

  const placed = orders.filter((o) => o.status === "pending");
  for (const o of placed) o.status = "open";
  if (placed.length) {
    await addEvent(bot.id, "info", `[Paper] Resting ${placed.length} order${placed.length === 1 ? "" : "s"}: ${placed.map(describe).join("; ")}.`);
    action = "paper placed";
  }

  for (const o of paperFills(orders, price.priceUsd)) {
    o.status = "filled";
    await onFilled(bot, config, state, o, true);
    action = "paper fill";
  }
  // Counter orders queued by fills rest straight away on paper.
  for (const o of orders) if (o.status === "pending") o.status = "open";

  if (ladderDone(config, state)) {
    state.completedAt = now.toISOString();
    await addEvent(bot.id, "info", "[Paper] Every rung filled. Ladder complete.");
    await saveBot(bot.id, state, "stopped");
    return "completed";
  }
  await saveBot(bot.id, state);
  return action;
}

// ---------- Live ----------

async function liveTick(bot: BotRow, config: LimitConfig, state: BotState, now: Date, busyAgents: Set<string>): Promise<string | null> {
  const orders = state.orders!;

  // 1. A placement on its way: settle it before anything else.
  const placing = orders.find((o) => o.status === "placing");
  if (placing) {
    busyAgents.add(bot.agentId);
    return settlePlacement(bot, config, state, placing);
  }

  // 2. Follow resting orders (reads cost no quota).
  let changed = false;
  for (const o of orders.filter((x) => LIVE.has(x.status) && x.orderId)) {
    const live = await getLimitOrder(bot.agentId, o.orderId!).catch(() => null);
    if (!live) continue;
    if (live.fill_status === "filled") {
      o.status = "filled";
      await onFilled(bot, config, state, o, false);
      changed = true;
    } else if (live.fill_status === "partially_filled" && o.status !== "partially_filled") {
      o.status = "partially_filled";
      await addEvent(bot.id, "trade", `Partly filled: ${describe(o)}. The rest keeps resting.`);
      changed = true;
    } else if (live.fill_status === "expired") {
      // NEAR Intents orders last at most 7 days: re-place it.
      Object.assign(o, { status: "pending", orderId: undefined, idempotencyKey: undefined, correlationId: undefined });
      await addEvent(bot.id, "info", `Expired after 7 days, re-placing: ${describe(o)}.`);
      changed = true;
    } else if (live.fill_status === "canceled") {
      o.status = "canceled";
      await addEvent(bot.id, "warn", `Cancelled outside Zorro: ${describe(o)}.`);
      changed = true;
    }
  }

  if (ladderDone(config, state)) {
    state.completedAt = now.toISOString();
    await addEvent(bot.id, "info", "Every rung filled. Ladder complete.");
    await saveBot(bot.id, state, "stopped");
    return "completed";
  }

  // 3. Place the next pending order, one at a time per wallet.
  const pending = orders.find((o) => o.status === "pending");
  if (!pending) {
    if (changed) await saveBot(bot.id, state);
    return changed ? "orders updated" : null;
  }
  if (busyAgents.has(bot.agentId) || (await agentHasOpenTrade(bot.agentId))) {
    await saveBot(bot.id, state);
    return "waiting: wallet busy";
  }
  busyAgents.add(bot.agentId);
  return placeOrder(bot, config, state, pending);
}

async function placeOrder(bot: BotRow, config: LimitConfig, state: BotState, o: LimitOrderState): Promise<string> {
  const market = await realZecPrice();
  if (market) {
    const clamped = clampToMarket(o.side, o.priceUsd, market);
    if (clamped !== o.priceUsd) {
      await addEvent(bot.id, "info", `Moved ${o.side} price from $${o.priceUsd.toFixed(2)} to $${clamped.toFixed(2)} to stay within 1% of the market ($${market.toFixed(2)}).`);
      o.priceUsd = clamped;
    }
  }
  const body = orderBody(config, o);

  const preview = await previewLimitOrder(bot.agentId, body);
  const refusals = preview.warnings.map((w) => w.code).filter((c) => !NON_BLOCKING_WARNINGS.has(c));
  if (refusals.length) {
    const reason = refusals.join(", ").replaceAll("_", " ");
    await addEvent(bot.id, "error", `${describe(o)} not placed: NEAR Intents would refuse it (${reason}). Bot paused.`);
    await saveBot(bot.id, { ...state, lastError: reason }, "paused");
    return "paused: " + reason;
  }

  const grantToken = await grantTokenFor(bot.agentId);
  const idempotencyKey = newIdempotencyKey("order");
  await db.insert(schema.operations).values({ idempotencyKey, agentId: bot.agentId, botId: bot.id, kind: "limit_order", status: "SENDING", request: body });
  Object.assign(o, { status: "placing", idempotencyKey });
  await saveBot(bot.id, state);
  await addEvent(bot.id, "trade", `Placing on NEAR Intents: ${describe(o)}.`);
  await sendPlacement(bot, state, o, body, grantToken);
  return "placing order";
}

async function sendPlacement(bot: BotRow, state: BotState, o: LimitOrderState, body: LimitOrderBody, grantToken: string): Promise<void> {
  try {
    const op = await placeLimitOrder(bot.agentId, body, { grantToken, idempotencyKey: o.idempotencyKey! });
    await db
      .update(schema.operations)
      .set({ correlationId: op.correlation_id, status: op.status, response: op as Record<string, unknown> })
      .where(eq(schema.operations.idempotencyKey, o.idempotencyKey!));
    o.correlationId = op.correlation_id ?? undefined;
    await saveBot(bot.id, state);
  } catch (e) {
    if (e instanceof AgentApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
      // Definite refusal: nothing was placed.
      await db.update(schema.operations).set({ status: "FAILED" }).where(eq(schema.operations.idempotencyKey, o.idempotencyKey!));
      o.status = "failed";
      await addEvent(bot.id, "error", `NEAR Intents refused ${describe(o)} (${e.code ?? e.status}). Bot paused.`);
      await saveBot(bot.id, { ...state, lastError: e.code ?? String(e.status) }, "paused");
      return;
    }
    // Unconfirmed: the next tick resends the same order with the SAME key.
    await addEvent(bot.id, "warn", "Couldn't confirm the order was received; will retry safely with the same request.");
  }
}

async function settlePlacement(bot: BotRow, config: LimitConfig, state: BotState, o: LimitOrderState): Promise<string | null> {
  const [row] = o.idempotencyKey
    ? await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, o.idempotencyKey)).limit(1)
    : [];
  if (!row || row.status === "FAILED") {
    o.status = row ? "failed" : "pending";
    await saveBot(bot.id, state);
    return "cleared placement";
  }
  if (!row.correlationId) {
    await sendPlacement(bot, state, o, row.request as LimitOrderBody, await grantTokenFor(bot.agentId));
    return "resent placement with same key";
  }

  const op = await operationStatus(row.correlationId);
  if (op.status !== row.status) {
    await db.update(schema.operations).set({ status: op.status, response: op as Record<string, unknown> }).where(eq(schema.operations.idempotencyKey, row.idempotencyKey));
  }
  if (!FINAL_STATUSES.includes(op.status)) return null;

  if (op.status === "SUCCESS") {
    const orderId = (op.details as { order_id?: unknown } | undefined)?.order_id;
    Object.assign(o, { status: "open", orderId: typeof orderId === "string" ? orderId : undefined });
    await addEvent(bot.id, "info", `Resting on NEAR Intents: ${describe(o)}.`, {}, row.correlationId);
    await saveBot(bot.id, state);
    return "order resting";
  }
  if (op.failure_code === "policy_price_deviation_exceeded") {
    // The market moved while it was placed: retry at a price inside the bound.
    Object.assign(o, { status: "pending", idempotencyKey: undefined, correlationId: undefined });
    await addEvent(bot.id, "warn", "The market moved while placing; re-pricing the order.", {}, row.correlationId);
    await saveBot(bot.id, state);
    return "re-pricing";
  }
  o.status = "failed";
  await addEvent(bot.id, "error", `Order not placed (${op.failure_code ?? op.status}). Bot paused; funds stay in your wallet.`, {}, row.correlationId);
  await saveBot(bot.id, { ...state, lastError: op.failure_code ?? op.status }, "paused");
  return "placement failed";
}

// ---------- Stop: cancel resting orders ----------

/**
 * Cancel every order this bot has resting. Unfilled amounts return to the wallet.
 * Returns what couldn't be cancelled yet (e.g. wallet busy), so the caller can say so.
 */
export async function cancelBotOrders(bot: BotRow, state: BotState, mode: "paper" | "live"): Promise<{ state: BotState; failed: string[] }> {
  const orders = state.orders ?? [];
  if (orders.some((o) => o.status === "placing")) {
    return { state, failed: ["An order is still being placed. Try again in a few seconds."] };
  }
  const failed: string[] = [];
  const grantToken = mode === "live" && orders.some((o) => LIVE.has(o.status) && o.orderId) ? await grantTokenFor(bot.agentId) : null;
  for (const o of orders) {
    if (o.status === "pending") o.status = "canceled";
    if (!LIVE.has(o.status)) continue;
    if (mode === "paper" || !o.orderId) {
      o.status = "canceled";
      continue;
    }
    try {
      await cancelLimitOrder(bot.agentId, o.orderId, grantToken!);
      o.status = "canceled";
    } catch (e) {
      failed.push(`${describe(o)}: ${e instanceof AgentApiError ? (e.code ?? e.status) : "network error"}`);
    }
  }
  return { state: { ...state, orders }, failed };
}
