// The bot worker's brain: one tick = read the price, evaluate every active bot, act.
// Server-side only (used by scripts/worker.ts and the demo API).
//
// Safety rules:
// - Paper bots only ever ask for quotes. They never move money.
// - Live bots check the quote's warnings first: a trade NEAR Intents would refuse is not sent.
// - One money action per agent at a time (NEAR Intents' own rule: wallet_busy).
// - A trade is saved with its Idempotency-Key BEFORE it is sent. If the send fails midway it is
//   resent with the SAME key; an UNCERTAIN result is polled, never resent under a new key.

import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { STABLECOINS, ZEC, fromBaseUnits } from "../assets";
import {
  AgentApiError,
  FINAL_STATUSES,
  agentSwap,
  operationStatus,
  quoteAgentSwap,
  tokens,
  type SwapBody,
} from "../agent-api";
import { decryptSecret, newIdempotencyKey } from "../crypto";
import { BotConfigSchema, type BotConfig, type BotState } from "./config";
import { evaluate, nextDcaRun, type Decision } from "./engine";

const DEMO_PRICE_KEY = "demo_price";
const HEARTBEAT_KEY = "worker_heartbeat";
const MAX_FAILURES = 3;
// Quote warnings that are notes, not refusals.
const NON_BLOCKING_WARNINGS = new Set(["high_fee", "asset_delivered_as_is"]);

type BotRow = typeof schema.bots.$inferSelect;
type Log = (msg: string) => void;

// ---------- Price (with demo override) ----------

export async function getDemoPrice(): Promise<{ priceUsd: number; setAt: string } | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, DEMO_PRICE_KEY)).limit(1);
  const v = row?.value as { priceUsd?: number; setAt?: string } | undefined;
  return v?.priceUsd ? { priceUsd: v.priceUsd, setAt: v.setAt ?? "" } : null;
}

export async function setDemoPrice(priceUsd: number | null): Promise<void> {
  if (priceUsd === null) {
    await db.delete(schema.appState).where(eq(schema.appState.key, DEMO_PRICE_KEY));
    return;
  }
  const value = { priceUsd, setAt: new Date().toISOString() };
  await db
    .insert(schema.appState)
    .values({ key: DEMO_PRICE_KEY, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value, updatedAt: new Date() } });
}

/** ZEC/USD from NEAR Intents (the venue bots trade on), unless demo mode overrides it. */
export async function zecPrice(): Promise<{ priceUsd: number; source: "demo" | "near-intents" }> {
  const demo = await getDemoPrice();
  if (demo) return { priceUsd: demo.priceUsd, source: "demo" };
  const list = await tokens();
  const zec = list.find((t) => t.asset_id === ZEC.assetId);
  if (!zec?.price) throw new Error("No ZEC price from NEAR Intents");
  return { priceUsd: zec.price, source: "near-intents" };
}

export async function workerHeartbeat(): Promise<string | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, HEARTBEAT_KEY)).limit(1);
  return (row?.value as { at?: string } | undefined)?.at ?? null;
}

// ---------- Tick ----------

export type TickSummary = { priceUsd: number; source: string; bots: number; actions: string[] };

export async function runTick(log: Log = () => {}): Promise<TickSummary> {
  const now = new Date();
  await db
    .insert(schema.appState)
    .values({ key: HEARTBEAT_KEY, value: { at: now.toISOString() } })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value: { at: now.toISOString() }, updatedAt: now } });

  const price = await zecPrice();
  const rows = await db
    .select({ bot: schema.bots })
    .from(schema.bots)
    .innerJoin(schema.agents, eq(schema.bots.agentId, schema.agents.id))
    .where(and(eq(schema.bots.status, "active"), eq(schema.agents.status, "ACTIVE")));

  const actions: string[] = [];
  const busyAgents = new Set<string>();
  for (const { bot } of rows) {
    try {
      const action = await processBot(bot, price, now, busyAgents);
      if (action) {
        actions.push(action);
        log(`${bot.name}: ${action}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`${bot.name}: error ${msg}`);
      await addEvent(bot.id, "error", `Tick failed: ${msg.slice(0, 200)}`);
    }
  }
  return { priceUsd: price.priceUsd, source: price.source, bots: rows.length, actions };
}

async function processBot(bot: BotRow, price: { priceUsd: number; source: string }, now: Date, busyAgents: Set<string>): Promise<string | null> {
  const config = BotConfigSchema.parse(bot.config);
  const state = (bot.state ?? {}) as BotState;

  if (state.inFlight) {
    busyAgents.add(bot.agentId);
    return settleInFlight(bot, config, state);
  }

  const { decision, state: next } = evaluate(config, state, price.priceUsd, now);
  if (decision.type === "hold") {
    if (next.completedAt && !state.completedAt) {
      await saveBot(bot.id, next, "stopped");
      await addEvent(bot.id, "info", "Completed: reached the maximum number of buys.");
      return "completed";
    }
    await saveBot(bot.id, next);
    return null;
  }

  // NEAR Intents runs one money action per wallet at a time.
  if (busyAgents.has(bot.agentId) || (await agentHasOpenTrade(bot.agentId))) {
    await saveBot(bot.id, next);
    return "waiting: wallet busy";
  }
  busyAgents.add(bot.agentId);
  return execute(bot, config, next, decision, price, now);
}

// ---------- Execute a decision ----------

function swapFor(config: BotConfig, decision: Exclude<Decision, { type: "hold" }>): { body: SwapBody; outDecimals: number } {
  if (decision.type === "sell_zec") {
    const stable = STABLECOINS.find((s) => s.key === (config as { sellTo: string }).sellTo)!;
    return {
      body: { origin_asset: ZEC.assetId, destination_asset: stable.assetId, amount: String(Math.round(decision.amountZec * 1e8)) },
      outDecimals: stable.decimals,
    };
  }
  const stable = STABLECOINS.find((s) => s.key === (config as { payWith: string }).payWith)!;
  return {
    body: { origin_asset: stable.assetId, destination_asset: ZEC.assetId, amount: String(Math.round(decision.amountUsd * 10 ** stable.decimals)) },
    outDecimals: ZEC.decimals,
  };
}

async function execute(
  bot: BotRow,
  config: BotConfig,
  state: BotState,
  decision: Exclude<Decision, { type: "hold" }>,
  price: { priceUsd: number; source: string },
  now: Date,
): Promise<string> {
  const { body, outDecimals } = swapFor(config, decision);
  const quote = await quoteAgentSwap(bot.agentId, body);
  const amountOut = quote.quote.amount_out ?? "0";
  const outHuman = fromBaseUnits(amountOut, outDecimals);
  const refusals = quote.warnings.filter((w) => !NON_BLOCKING_WARNINGS.has(w.code)).map((w) => w.code);
  const selling = decision.type === "sell_zec";
  const what = selling
    ? `Sell ${decision.amountZec} ZEC → ~${Number(outHuman).toFixed(2)} USDC`
    : `Buy ~${Number(outHuman).toFixed(5)} ZEC with ${decision.amountUsd} USDC`;
  // In demo mode the trigger uses the fake price, but quotes (and live trades) use the real market.
  const at = price.source === "demo" ? `, triggered at the demo price of $${price.priceUsd.toFixed(2)} (amounts from a real quote at today's market price)` : ` at $${price.priceUsd.toFixed(2)}`;

  if (config.mode === "paper") {
    const after = applyFill(config, state, decision, body.amount, amountOut, now);
    const caveat = refusals.length ? ` A live trade would be refused right now: ${refusals.join(", ").replaceAll("_", " ")}.` : "";
    await addEvent(bot.id, "trade", `[Paper] ${what}${at}. ${decision.reason}.${caveat}`, {
      paper: true,
      amountIn: body.amount,
      amountOut,
      feePercent: quote.fee?.percent ?? null,
    });
    await saveBot(bot.id, after, after.completedAt ? "stopped" : undefined);
    return `paper ${decision.type}`;
  }

  // ---- Live ----
  if (refusals.length) {
    const reason = refusals.join(", ").replaceAll("_", " ");
    await addEvent(bot.id, "error", `${what} not sent: NEAR Intents would refuse it (${reason}). Bot paused.`, { refusals });
    await saveBot(bot.id, { ...state, lastError: reason }, "paused");
    return "paused: " + reason;
  }

  const grantToken = await grantTokenFor(bot.agentId);
  const minOut = (BigInt(amountOut) * BigInt(10_000 - config.slippageBps)) / BigInt(10_000);
  const idempotencyKey = newIdempotencyKey("bot");
  const swapBody: SwapBody = { ...body, min_amount_out: minOut.toString(), note: oneLine(`${decision.reason} (Zorro bot "${bot.name}")`) };

  await db.insert(schema.operations).values({ idempotencyKey, agentId: bot.agentId, botId: bot.id, kind: "swap", status: "SENDING", request: swapBody });
  const inFlightState: BotState = {
    ...state,
    inFlight: { idempotencyKey, side: decision.type, amountIn: body.amount, expectedOut: amountOut, reason: decision.reason, sentAt: now.toISOString() },
    // DCA: schedule the next buy now, so a slow or failed trade never causes a double buy.
    ...(config.kind === "smart_dca" ? { nextRunAt: nextDcaRun(config.everyHours, now) } : {}),
  };
  await saveBot(bot.id, inFlightState);
  await addEvent(bot.id, "trade", `${what}${at}: sent to NEAR Intents. ${decision.reason}.`);
  await sendSwap(bot, swapBody, idempotencyKey, grantToken);
  return `live ${decision.type}`;
}

async function sendSwap(bot: BotRow, swapBody: SwapBody, idempotencyKey: string, grantToken: string): Promise<void> {
  try {
    const op = await agentSwap(bot.agentId, swapBody, { grantToken, idempotencyKey });
    await db
      .update(schema.operations)
      .set({ correlationId: op.correlation_id, status: op.status, response: op as Record<string, unknown> })
      .where(eq(schema.operations.idempotencyKey, idempotencyKey));
  } catch (e) {
    if (e instanceof AgentApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
      // A definite refusal: nothing ran. Record it and clear the in-flight marker.
      await db.update(schema.operations).set({ status: "FAILED" }).where(eq(schema.operations.idempotencyKey, idempotencyKey));
      const state = ((await botById(bot.id))?.state ?? {}) as BotState;
      await saveBot(bot.id, { ...state, inFlight: undefined, lastError: e.code ?? String(e.status) }, "paused");
      await addEvent(bot.id, "error", `NEAR Intents refused the trade (${e.code ?? e.status}${e.detail ? `: ${e.detail}` : ""}). Bot paused.`);
      return;
    }
    // Network trouble, rate limit or 5xx: keep SENDING; the next tick resends with the SAME key.
    await addEvent(bot.id, "warn", "Couldn't confirm the trade was received; will retry safely with the same request.");
  }
}

// ---------- Settle a live trade ----------

async function settleInFlight(bot: BotRow, config: BotConfig, state: BotState): Promise<string | null> {
  const inFlight = state.inFlight!;
  const [row] = await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, inFlight.idempotencyKey)).limit(1);
  if (!row) {
    await saveBot(bot.id, { ...state, inFlight: undefined });
    return "cleared missing trade";
  }
  if (!row.correlationId) {
    if (row.status === "FAILED") {
      await saveBot(bot.id, { ...state, inFlight: undefined });
      return "cleared refused trade";
    }
    // Sent but unconfirmed: resend the SAME request with the SAME key (safe by design).
    await sendSwap(bot, row.request as SwapBody, row.idempotencyKey, await grantTokenFor(bot.agentId));
    return "resent with same key";
  }

  const op = await operationStatus(row.correlationId);
  if (op.status !== row.status) {
    await db.update(schema.operations).set({ status: op.status, response: op as Record<string, unknown> }).where(eq(schema.operations.idempotencyKey, row.idempotencyKey));
  }
  if (op.status === "NEEDS_REVIEW" && row.status !== "NEEDS_REVIEW") {
    await addEvent(bot.id, "warn", `NEAR Intents stopped automatic settlement (${op.failure_code ?? "needs review"}). Bot paused; your funds are safe in the wallet or in transit.`, {}, row.correlationId);
    await saveBot(bot.id, state, "paused");
    return "needs review";
  }
  if (!FINAL_STATUSES.includes(op.status)) return null;

  if (op.status === "SUCCESS") {
    const decision: Decision =
      inFlight.side === "sell_zec"
        ? { type: "sell_zec", amountZec: Number(inFlight.amountIn) / 1e8, reason: inFlight.reason }
        : { type: "buy_zec", amountUsd: Number(inFlight.amountIn) / 1e6, reason: inFlight.reason };
    const after = applyFill(config, { ...state, inFlight: undefined, lastError: undefined, failures: 0 }, decision, inFlight.amountIn, inFlight.expectedOut, new Date(), true);
    const msg =
      inFlight.side === "sell_zec"
        ? `Sold ${Number(inFlight.amountIn) / 1e8} ZEC for ~${(Number(inFlight.expectedOut) / 1e6).toFixed(2)} USDC.`
        : `Bought ~${(Number(inFlight.expectedOut) / 1e8).toFixed(5)} ZEC for ${(Number(inFlight.amountIn) / 1e6).toFixed(2)} USDC.`;
    await addEvent(bot.id, "trade", `${msg} Settled on NEAR Intents.`, {}, row.correlationId);
    await saveBot(bot.id, after, after.completedAt ? "stopped" : undefined);
    return "settled";
  }

  // REFUNDED or FAILED: nothing (or everything) came back to the wallet.
  const failures = (state.failures ?? 0) + 1;
  const pause = failures >= MAX_FAILURES;
  await addEvent(
    bot.id,
    "error",
    `Trade ${op.status.toLowerCase()} (${op.failure_code ?? "no reason given"}). Funds stay in your wallet.${pause ? " Paused after repeated failures." : " Will try again."}`,
    {},
    row.correlationId,
  );
  await saveBot(bot.id, { ...state, inFlight: undefined, lastError: op.failure_code ?? op.status, failures }, pause ? "paused" : undefined);
  return `trade ${op.status}`;
}

/** Update a bot's memory after a fill (simulated for paper, settled for live). */
function applyFill(config: BotConfig, state: BotState, decision: Exclude<Decision, { type: "hold" }>, amountIn: string, amountOut: string, now: Date, settled = false): BotState {
  if (decision.type === "sell_zec") {
    return {
      ...state,
      soldZec: (state.soldZec ?? 0) + Number(amountIn) / 1e8,
      receivedUsd: (state.receivedUsd ?? 0) + Number(amountOut) / 1e6,
      completedAt: now.toISOString(), // stop-loss and trailing stop sell once
    };
  }
  const dca = config as Extract<BotConfig, { kind: "smart_dca" }>;
  const buys = (state.buys ?? 0) + 1;
  return {
    ...state,
    buys,
    spentUsd: (state.spentUsd ?? 0) + Number(amountIn) / 1e6,
    boughtZec: (state.boughtZec ?? 0) + Number(amountOut) / 1e8,
    // Live trades already scheduled the next run when they were sent.
    nextRunAt: settled ? state.nextRunAt : nextDcaRun(dca.everyHours, now),
    completedAt: dca.maxBuys !== null && buys >= dca.maxBuys ? now.toISOString() : state.completedAt,
  };
}

// ---------- Helpers ----------

async function agentHasOpenTrade(agentId: string): Promise<boolean> {
  const [open] = await db
    .select({ k: schema.operations.idempotencyKey })
    .from(schema.operations)
    .where(
      and(
        eq(schema.operations.agentId, agentId),
        inArray(schema.operations.kind, ["swap", "withdraw", "limit_order"]),
        notInArray(schema.operations.status, FINAL_STATUSES),
      ),
    )
    .limit(1);
  return Boolean(open);
}

async function grantTokenFor(agentId: string): Promise<string> {
  const [grant] = await db.select().from(schema.grants).where(eq(schema.grants.agentId, agentId)).orderBy(desc(schema.grants.createdAt)).limit(1);
  if (!grant || grant.revokedAt || grant.expiresAt < new Date()) throw new Error("No valid bot permission for this wallet");
  return decryptSecret(grant.tokenCiphertext, agentId);
}

async function botById(id: string) {
  const [bot] = await db.select().from(schema.bots).where(eq(schema.bots.id, id)).limit(1);
  return bot ?? null;
}

async function saveBot(id: string, state: BotState, status?: BotRow["status"]): Promise<void> {
  await db
    .update(schema.bots)
    .set({ state: state as Record<string, unknown>, ...(status ? { status } : {}) })
    .where(eq(schema.bots.id, id));
}

export async function addEvent(
  botId: string,
  level: "info" | "trade" | "warn" | "error",
  message: string,
  data: Record<string, unknown> = {},
  correlationId: string | null = null,
): Promise<void> {
  await db.insert(schema.botEvents).values({ botId, level, message, data, correlationId });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 480);
}
