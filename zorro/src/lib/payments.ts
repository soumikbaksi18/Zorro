// The payment engine. Server-side only (web app + worker).
//
// A payment is quoted first ("this costs 0.0273 ZEC"), then queued. The worker runs it in
// steps, one money action per wallet at a time (NEAR Intents' own rule):
//   queued → converting (swap ZEC → the payee's coin, if needed) → sending (withdraw or
//   transfer to the approved payee) → done
// Every step is saved with its Idempotency-Key BEFORE it is sent, so a crash or timeout is
// retried with the SAME key and can never pay twice. UNCERTAIN results are polled, never resent.

import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  AgentApiError,
  FINAL_STATUSES,
  agentSwap,
  getBalances,
  operationStatus,
  previewWithdraw,
  quoteAgentSwap,
  transfer,
  withdraw,
  type Operation,
} from "./agent-api";
import { AgentError, agentWithGrant } from "./agent-service";
import { COIN_KEYS, ZEC_COIN, ceilDecimal, coin, fromUnits, toUnits, type Coin } from "./coins";
import { decryptSecret, newIdempotencyKey } from "./crypto";
import { payeeFor, type PayeeView } from "./payees";
import { getRates, priceOf, toUsd, type Rates } from "./rates";
import type { CurrentUser } from "./session";

// ---------- Input & quote ----------

export const PayInputSchema = z.object({
  payeeId: z.string().min(1),
  amount: z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter an amount"),
  currency: z.enum(["COIN", "USD", "INR"]),
  /** Pay from ZEC (converted at the moment of paying) or from the same coin already in the wallet. */
  fundWith: z.enum(["zec", "coin"]).default("zec"),
  note: z.string().trim().max(120).optional(),
});
export type PayInput = z.infer<typeof PayInputSchema>;

type Plan = {
  coinKey: string;
  targetUnits: string; // what the payee receives
  sendUnits: string; // what leaves the wallet in the payee's coin (target + network fee)
  fundCoinKey: string;
  fundUnits: string; // what leaves the wallet in the funding coin
  needsSwap: boolean;
  minOutUnits: string | null;
  route: "withdraw" | "transfer" | "swap"; // "swap" = convert inside the wallet, nothing is sent out
  chain: string;
  recipient: string;
};

export type PaymentQuote = {
  payee: Pick<PayeeView, "id" | "name" | "kind" | "coinKey" | "chain" | "handle" | "status">;
  coinKey: string;
  amount: string; // payee receives (human units)
  usd: number;
  inr: number;
  fundCoinKey: string;
  fundAmount: string; // you pay (human units of fundCoinKey)
  feeUsd: number | null;
  zecUsd: number;
  problems: string[];
  notes: string[];
  plan: Plan;
};

const SWAP_BUFFER = 1.02; // covers the ~0.6% conversion fee and price movement; the rest stays in your wallet
const NON_BLOCKING = new Set(["high_fee", "asset_delivered_as_is"]);

export async function quotePayment(user: CurrentUser, input: PayInput): Promise<PaymentQuote> {
  const { agent, grantToken } = await agentWithGrant(user);
  const payee = await payeeFor(user, input.payeeId);
  const c = coin(payee.coinKey);
  const rates = await getRates().catch(() => {
    throw new AgentError("Prices are unavailable right now. Try again in a minute.", 503);
  });

  // 1. What the payee receives, in their coin.
  let amount: string;
  try {
    amount = input.currency === "COIN" ? input.amount : ceilDecimal(toUsd(rates, Number(input.amount), input.currency) / priceOf(rates, c), c.decimals);
  } catch (e) {
    throw new AgentError(e instanceof Error ? e.message : "No price for this coin", 503);
  }
  const targetUnits = toUnits(amount, c.decimals);
  if (BigInt(targetUnits) <= BigInt(0)) throw new AgentError("Enter an amount above zero.");
  const usd = toUsd(rates, Number(amount), "COIN", c);

  const problems: string[] = [];
  const notes: string[] = [];
  let feeUsd = 0;
  let feeKnown = true;
  const route = payee.kind === "zorro" ? "transfer" : "withdraw";

  // 2. Network fee for sending it out (transfers between Zorro wallets have none).
  let sendUnits = targetUnits;
  if (route === "withdraw") {
    try {
      const preview = await previewWithdraw(
        agent.id,
        { asset: c.assetId, amount: targetUnits, chain: payee.chain, recipient: payee.address },
        { grantToken, idempotencyKey: newIdempotencyKey("ppreview") },
      );
      const out = preview.quote.amount_out;
      if (out && BigInt(out) < BigInt(targetUnits)) sendUnits = (BigInt(targetUnits) * BigInt(2) - BigInt(out)).toString();
      if (preview.fee?.amount_usd) feeUsd += Number(preview.fee.amount_usd);
      else feeKnown = false;
      for (const w of preview.warnings) {
        if (w.code === "insufficient_balance") continue; // the conversion below provides it
        (NON_BLOCKING.has(w.code) ? notes : problems).push(friendlyCode(w.code, c.symbol));
      }
    } catch (e) {
      problems.push(explain(e, c.symbol).message);
    }
  }

  // 3. Where the money comes from: ZEC converted now, or the same coin already in the wallet.
  const fund: Coin = c.key === ZEC_COIN.key || input.fundWith === "coin" ? c : ZEC_COIN;
  const needsSwap = fund.key !== c.key;
  let fundUnits = sendUnits;
  let minOutUnits: string | null = null;
  if (needsSwap) {
    const sendHuman = Number(fromUnits(sendUnits, c.decimals));
    let zecIn = toUnits(ceilDecimal(((sendHuman * priceOf(rates, c)) / rates.zecUsd) * SWAP_BUFFER, fund.decimals), fund.decimals);
    try {
      let q = await quoteAgentSwap(agent.id, { origin_asset: fund.assetId, destination_asset: c.assetId, amount: zecIn }, grantToken);
      const out = BigInt(q.quote.amount_out ?? "0");
      if (out > BigInt(0) && out < BigInt(sendUnits)) {
        // Not quite enough: scale up once and re-quote.
        zecIn = ((BigInt(zecIn) * BigInt(sendUnits) * BigInt(1005)) / (out * BigInt(1000)) + BigInt(1)).toString();
        q = await quoteAgentSwap(agent.id, { origin_asset: fund.assetId, destination_asset: c.assetId, amount: zecIn }, grantToken);
      }
      if (q.fee?.amount_usd) feeUsd += Number(q.fee.amount_usd);
      else feeKnown = false;
      for (const w of q.warnings) {
        if (w.code === "insufficient_balance") continue; // checked below with a clearer message
        (NON_BLOCKING.has(w.code) ? notes : problems).push(friendlyCode(w.code, fund.symbol));
      }
    } catch (e) {
      problems.push(explain(e, fund.symbol).message);
    }
    fundUnits = zecIn;
    minOutUnits = sendUnits;
  }

  // 4. Does the wallet hold enough?
  try {
    const { balances } = await getBalances(agent.id);
    const have = BigInt(balances.find((b) => b.asset_id === fund.assetId)?.balance_raw ?? "0");
    if (have < BigInt(fundUnits)) {
      problems.push(`You have ${fromUnits(have.toString(), fund.decimals)} ${fund.symbol}; this needs ${fromUnits(fundUnits, fund.decimals)} ${fund.symbol}. Add funds first.`);
    }
  } catch {
    notes.push("Couldn't check your balance just now.");
  }
  if (payee.status !== "approved") problems.unshift("Approve this payee with Face ID first.");

  return {
    payee: { id: payee.id, name: payee.name, kind: payee.kind, coinKey: payee.coinKey, chain: payee.chain, handle: payee.handle, status: payee.status },
    coinKey: c.key,
    amount,
    usd,
    inr: usd * rates.usdInr,
    fundCoinKey: fund.key,
    fundAmount: fromUnits(fundUnits, fund.decimals),
    feeUsd: feeKnown ? feeUsd : null,
    zecUsd: rates.zecUsd,
    problems: [...new Set(problems)],
    notes,
    plan: { coinKey: c.key, targetUnits, sendUnits, fundCoinKey: fund.key, fundUnits, needsSwap, minOutUnits, route, chain: payee.chain, recipient: payee.address },
  };
}

// ---------- Create ----------

const newReference = () => `ZR${randomBytes(5).toString("hex").toUpperCase()}`;

export async function createPayment(user: CurrentUser, input: PayInput, opts: { scheduleId?: string } = {}): Promise<{ id: string; quote: PaymentQuote }> {
  const quote = await quotePayment(user, input);
  if (quote.problems.length) throw new AgentError(quote.problems[0], 409);
  const { agent } = await agentWithGrant(user);
  const id = randomUUID();
  await db.insert(schema.payments).values({
    id,
    userId: user.id,
    agentId: agent.id,
    direction: "out",
    kind: opts.scheduleId ? "autopay" : quote.plan.route === "transfer" ? "transfer" : "pay",
    payeeId: quote.payee.id,
    scheduleId: opts.scheduleId ?? null,
    counterparty: quote.payee.name,
    coinKey: quote.coinKey,
    amount: quote.amount,
    fundCoinKey: quote.fundCoinKey,
    fundAmount: quote.fundAmount,
    usdValue: quote.usd,
    inrValue: quote.inr,
    feeUsd: quote.feeUsd,
    zecUsd: quote.zecUsd,
    reference: newReference(),
    note: input.note || null,
    status: "queued",
    state: { plan: quote.plan },
  });
  return { id, quote };
}

/** Record a payment that failed before it started (e.g. an Autopay run without enough balance). */
export async function recordFailedPayment(
  user: CurrentUser,
  agentId: string,
  values: { payee: { id: string; name: string; coinKey: string }; amount: string; scheduleId: string; error: string },
) {
  await db.insert(schema.payments).values({
    id: randomUUID(),
    userId: user.id,
    agentId,
    direction: "out",
    kind: "autopay",
    payeeId: values.payee.id,
    scheduleId: values.scheduleId,
    counterparty: values.payee.name,
    coinKey: values.payee.coinKey,
    amount: values.amount,
    fundCoinKey: "zec",
    status: "failed",
    error: values.error,
    reference: newReference(),
    completedAt: new Date(),
  });
}

// ---------- Swap inside the wallet (ZEC → USDC, SOL, ETH…) ----------

export const ConvertInputSchema = z.object({
  from: z.enum(COIN_KEYS),
  to: z.enum(COIN_KEYS),
  amount: z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter an amount"),
  /** The amount is in the "from" coin, or in INR/USD worth of it. */
  amountIn: z.enum(["COIN", "INR", "USD"]).default("COIN"),
});
export type ConvertInput = z.infer<typeof ConvertInputSchema>;

export type ConvertQuote = {
  from: string;
  to: string;
  fromAmount: string;
  toAmount: string; // expected
  minToAmount: string; // never less than this (1% slippage)
  usd: number;
  inr: number;
  feeUsd: number | null;
  rate: number; // "to" per one "from"
  zecUsd: number;
  balance: string; // of the "from" coin
  problems: string[];
  notes: string[];
  plan: Plan;
};

const SWAP_SLIPPAGE_BPS = BigInt(100);

export async function quoteConvert(user: CurrentUser, input: ConvertInput): Promise<ConvertQuote> {
  if (input.from === input.to) throw new AgentError("Pick two different coins.");
  const { agent, grantToken } = await agentWithGrant(user);
  const from = coin(input.from);
  const to = coin(input.to);
  const rates = await getRates().catch(() => {
    throw new AgentError("Prices are unavailable right now. Try again in a minute.", 503);
  });

  let fromAmount: string;
  try {
    fromAmount = input.amountIn === "COIN" ? input.amount : ceilDecimal(toUsd(rates, Number(input.amount), input.amountIn) / priceOf(rates, from), from.decimals);
  } catch (e) {
    throw new AgentError(e instanceof Error ? e.message : "No price for this coin", 503);
  }
  const fundUnits = toUnits(fromAmount, from.decimals);
  if (BigInt(fundUnits) <= BigInt(0)) throw new AgentError("Enter an amount above zero.");

  const problems: string[] = [];
  const notes: string[] = [];
  let outUnits = "0";
  let feeUsd: number | null = null;
  try {
    const q = await quoteAgentSwap(agent.id, { origin_asset: from.assetId, destination_asset: to.assetId, amount: fundUnits }, grantToken);
    outUnits = q.quote.amount_out ?? "0";
    feeUsd = q.fee?.amount_usd ? Number(q.fee.amount_usd) : null;
    for (const w of q.warnings) {
      if (w.code === "insufficient_balance") continue; // checked below with a clearer message
      (NON_BLOCKING.has(w.code) ? notes : problems).push(friendlyCode(w.code, from.symbol));
    }
  } catch (e) {
    problems.push(explain(e, from.symbol).message);
  }

  let balance = "0";
  try {
    const { balances } = await getBalances(agent.id);
    const have = BigInt(balances.find((b) => b.asset_id === from.assetId)?.balance_raw ?? "0");
    balance = fromUnits(have.toString(), from.decimals);
    if (have < BigInt(fundUnits)) problems.push(`You have ${balance} ${from.symbol}. Add funds or swap less.`);
  } catch {
    notes.push("Couldn't check your balance just now.");
  }

  const minOut = (BigInt(outUnits) * (BigInt(10_000) - SWAP_SLIPPAGE_BPS)) / BigInt(10_000);
  const usd = toUsd(rates, Number(fromAmount), "COIN", from);
  const toAmount = fromUnits(outUnits, to.decimals);
  return {
    from: from.key,
    to: to.key,
    fromAmount,
    toAmount,
    minToAmount: fromUnits(minOut.toString(), to.decimals),
    usd,
    inr: usd * rates.usdInr,
    feeUsd,
    rate: Number(fromAmount) > 0 ? Number(toAmount) / Number(fromAmount) : 0,
    zecUsd: rates.zecUsd,
    balance,
    problems: [...new Set(problems)],
    notes,
    plan: {
      coinKey: to.key,
      targetUnits: outUnits,
      sendUnits: outUnits,
      fundCoinKey: from.key,
      fundUnits,
      needsSwap: true,
      minOutUnits: minOut.toString(),
      route: "swap",
      chain: "",
      recipient: "",
    },
  };
}

export async function createConvert(user: CurrentUser, input: ConvertInput): Promise<{ id: string }> {
  const quote = await quoteConvert(user, input);
  if (quote.problems.length) throw new AgentError(quote.problems[0], 409);
  if (BigInt(quote.plan.targetUnits) <= BigInt(0)) throw new AgentError("NEAR Intents couldn't quote this swap. Try another amount.", 409);
  const { agent } = await agentWithGrant(user);
  const from = coin(quote.from);
  const to = coin(quote.to);
  const id = randomUUID();
  await db.insert(schema.payments).values({
    id,
    userId: user.id,
    agentId: agent.id,
    direction: "out",
    kind: "swap",
    counterparty: `Swap ${from.symbol} → ${to.symbol}`,
    coinKey: to.key,
    amount: quote.toAmount,
    fundCoinKey: from.key,
    fundAmount: quote.fromAmount,
    usdValue: quote.usd,
    inrValue: quote.inr,
    feeUsd: quote.feeUsd,
    zecUsd: quote.zecUsd,
    reference: newReference(),
    status: "queued",
    state: { plan: quote.plan },
  });
  return { id };
}

// ---------- Run (worker) ----------

type State = {
  plan: Plan;
  swapKey?: string;
  sendKey?: string;
};

const ACTIVE = ["queued", "converting", "sending"] as const;

async function grantTokenFor(agentId: string): Promise<string | null> {
  const [grant] = await db.select().from(schema.grants).where(eq(schema.grants.agentId, agentId)).orderBy(desc(schema.grants.createdAt)).limit(1);
  if (!grant || grant.revokedAt || grant.expiresAt < new Date()) return null;
  return decryptSecret(grant.tokenCiphertext, agentId);
}

/** Advance every wallet's oldest unfinished payment by one step. */
export async function processPayments(log: (msg: string) => void = () => {}): Promise<number> {
  const rows = await db.select().from(schema.payments).where(inArray(schema.payments.status, [...ACTIVE])).orderBy(schema.payments.createdAt);
  const seen = new Set<string>();
  let n = 0;
  for (const row of rows) {
    if (seen.has(row.agentId)) continue; // one money action per wallet at a time
    seen.add(row.agentId);
    try {
      await step(row, log);
      n++;
    } catch (e) {
      log(`payment ${row.reference}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return n;
}

type PaymentRow = typeof schema.payments.$inferSelect;

async function step(row: PaymentRow, log: (msg: string) => void) {
  const state = row.state as unknown as State;
  const plan = state.plan;
  const grantToken = await grantTokenFor(row.agentId);
  if (!grantToken) return fail(row, "Zorro's payment permission is missing or expired. Nothing was sent.");

  if (row.status === "queued") {
    if (plan.needsSwap) {
      const key = state.swapKey ?? newIdempotencyKey("pswap");
      await save(row, { status: "converting", state: { ...state, swapKey: key } });
      log(`payment ${row.reference}: converting ${fromUnits(plan.fundUnits, coin(plan.fundCoinKey).decimals)} ${coin(plan.fundCoinKey).symbol}`);
      return send(row, "swap", key, swapBody(plan), grantToken);
    }
    const key = state.sendKey ?? newIdempotencyKey("psend");
    await save(row, { status: "sending", state: { ...state, sendKey: key } });
    log(`payment ${row.reference}: sending to ${row.counterparty}`);
    return send(row, plan.route, key, sendBody(plan, row), grantToken);
  }

  if (row.status === "converting" && state.swapKey) {
    const op = await follow(row, "swap", state.swapKey, swapBody(plan), grantToken);
    if (!op || !FINAL_STATUSES.includes(op.status)) {
      if (op?.status === "NEEDS_REVIEW") await save(row, { status: "review", error: "The conversion needs review by NEAR Intents. Nothing was sent to the payee." });
      return;
    }
    if (op.status !== "SUCCESS") {
      return fail(row, plan.route === "swap" ? `The swap didn't go through. Your ${coin(plan.fundCoinKey).symbol} stays in your wallet.` : "The conversion didn't go through, so nothing was sent. Your ZEC stays in your wallet.");
    }
    if (plan.route === "swap") {
      // An in-wallet swap ends here. Record what actually arrived when NEAR Intents reports it.
      const out = (op.details as { amount_out?: unknown } | undefined)?.amount_out;
      const amount = typeof out === "string" && /^\d+$/.test(out) ? fromUnits(out, coin(plan.coinKey).decimals) : row.amount;
      await save(row, { status: "done", amount, completedAt: new Date(), error: null });
      log(`payment ${row.reference}: swap done`);
      return;
    }
    const key = state.sendKey ?? newIdempotencyKey("psend");
    await save(row, { status: "sending", state: { ...state, sendKey: key } });
    log(`payment ${row.reference}: converted, sending to ${row.counterparty}`);
    return send(row, plan.route, key, sendBody(plan, row), grantToken);
  }

  if (row.status === "sending" && state.sendKey) {
    const op = await follow(row, plan.route, state.sendKey, sendBody(plan, row), grantToken);
    if (!op || !FINAL_STATUSES.includes(op.status)) {
      if (op?.status === "NEEDS_REVIEW") await save(row, { status: "review", error: "The payment needs review by NEAR Intents." });
      return;
    }
    if (op.status !== "SUCCESS") {
      const kept = plan.needsSwap ? ` The converted ${coin(plan.coinKey).symbol} stays in your wallet.` : "";
      return fail(row, `The payment didn't go through.${kept}`);
    }
    await save(row, { status: "done", completedAt: new Date(), error: null });
    log(`payment ${row.reference}: done`);
    if (plan.route === "transfer") await recordInboundTransfer(row);
  }
}

function swapBody(plan: Plan) {
  return {
    origin_asset: coin(plan.fundCoinKey).assetId,
    destination_asset: coin(plan.coinKey).assetId,
    amount: plan.fundUnits,
    ...(plan.minOutUnits ? { min_amount_out: plan.minOutUnits } : {}),
    note: "Zorro payment: conversion",
  };
}

function sendBody(plan: Plan, row: PaymentRow) {
  const c = coin(plan.coinKey);
  const reference = row.reference ?? undefined;
  return plan.route === "transfer"
    ? { asset: c.assetId, amount: plan.sendUnits, recipient: plan.recipient, reference, note: "Zorro payment" }
    : { asset: c.assetId, amount: plan.sendUnits, chain: plan.chain, recipient: plan.recipient, reference, note: "Zorro payment" };
}

type Route = "swap" | "withdraw" | "transfer";

function callApi(route: Route, agentId: string, body: Record<string, unknown>, g: { grantToken: string; idempotencyKey: string }) {
  if (route === "swap") return agentSwap(agentId, body as Parameters<typeof agentSwap>[1], g);
  if (route === "withdraw") return withdraw(agentId, body as Parameters<typeof withdraw>[1], g);
  return transfer(agentId, body as Parameters<typeof transfer>[1], g);
}

/** Save the step under its key, then send it. A definite refusal fails the payment; anything else retries with the same key. */
async function send(row: PaymentRow, route: Route, key: string, body: Record<string, unknown>, grantToken: string) {
  await db
    .insert(schema.operations)
    .values({ idempotencyKey: key, agentId: row.agentId, paymentId: row.id, kind: route, status: "SENDING", request: body })
    .onConflictDoNothing();
  try {
    const op = await callApi(route, row.agentId, body, { grantToken, idempotencyKey: key });
    await db
      .update(schema.operations)
      .set({ correlationId: op.correlation_id, status: op.status, response: op as Record<string, unknown> })
      .where(eq(schema.operations.idempotencyKey, key));
  } catch (e) {
    if (isDefiniteRefusal(e)) {
      await db.update(schema.operations).set({ status: "FAILED" }).where(eq(schema.operations.idempotencyKey, key));
      const symbol = coin((row.state as unknown as State).plan.coinKey).symbol;
      const kept = route !== "swap" && (row.state as unknown as State).plan.needsSwap ? ` The converted ${symbol} stays in your wallet.` : "";
      await fail(row, `${explain(e, symbol).message}${kept}`);
    }
    // Otherwise (busy, rate limit, network): the next tick resends with the same key.
  }
}

/** Current status of a step; resends with the same key if the first send never got an answer. */
async function follow(row: PaymentRow, route: Route, key: string, body: Record<string, unknown>, grantToken: string): Promise<Operation | null> {
  const [op] = await db.select().from(schema.operations).where(eq(schema.operations.idempotencyKey, key)).limit(1);
  if (!op) {
    await send(row, route, key, body, grantToken);
    return null;
  }
  if (op.status === "FAILED" && !op.correlationId) return { status: "FAILED" } as Operation;
  if (!op.correlationId) {
    await send(row, route, key, body, grantToken);
    return null;
  }
  const live = await operationStatus(op.correlationId).catch(() => null);
  if (live && live.status !== op.status) {
    await db.update(schema.operations).set({ status: live.status, response: live as Record<string, unknown> }).where(eq(schema.operations.idempotencyKey, key));
  }
  return live;
}

function isDefiniteRefusal(e: unknown): boolean {
  if (!(e instanceof AgentApiError)) return false;
  if (e.code === "wallet_busy" || e.status === 429 || e.status >= 500 || e.status === 0) return false;
  return e.status >= 400;
}

async function save(row: PaymentRow, patch: Partial<typeof schema.payments.$inferInsert>) {
  Object.assign(row, patch);
  await db.update(schema.payments).set(patch).where(eq(schema.payments.id, row.id));
}

async function fail(row: PaymentRow, error: string) {
  await save(row, { status: "failed", error, completedAt: new Date() });
}

/** The recipient of a Zorro-to-Zorro transfer sees it in their own ledger. */
async function recordInboundTransfer(row: PaymentRow) {
  const plan = (row.state as unknown as State).plan;
  const [recipient] = await db.select().from(schema.agents).where(eq(schema.agents.nearAccountId, plan.recipient)).limit(1);
  if (!recipient) return;
  const [sender] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, row.userId)).limit(1);
  await db.insert(schema.payments).values({
    id: randomUUID(),
    userId: recipient.userId,
    agentId: recipient.id,
    direction: "in",
    kind: "transfer",
    counterparty: sender?.handle ? `@${sender.handle}` : "A Zorro user",
    coinKey: row.coinKey,
    amount: row.amount,
    fundCoinKey: row.coinKey,
    fundAmount: row.amount,
    usdValue: row.usdValue,
    inrValue: row.inrValue,
    zecUsd: row.zecUsd,
    reference: row.reference,
    status: "done",
    completedAt: new Date(),
  });
}

// ---------- Read: ledger, receipts, summary ----------

export type PaymentView = {
  id: string;
  direction: "out" | "in";
  kind: string;
  counterparty: string;
  coinKey: string;
  amount: string;
  fundCoinKey: string;
  fundAmount: string | null;
  usd: number | null;
  inr: number | null;
  feeUsd: number | null;
  zecUsd: number | null;
  reference: string | null;
  note: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  scheduleId: string | null;
  steps: { needsSwap: boolean; route: "withdraw" | "transfer" | "swap" } | null;
};

export function paymentView(r: PaymentRow): PaymentView {
  const plan = (r.state as unknown as Partial<State>)?.plan;
  return {
    id: r.id,
    direction: r.direction,
    kind: r.kind,
    counterparty: r.counterparty,
    coinKey: r.coinKey,
    amount: r.amount,
    fundCoinKey: r.fundCoinKey,
    fundAmount: r.fundAmount,
    usd: r.usdValue,
    inr: r.inrValue,
    feeUsd: r.feeUsd,
    zecUsd: r.zecUsd,
    reference: r.reference,
    note: r.note,
    status: r.status,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    scheduleId: r.scheduleId,
    steps: plan ? { needsSwap: plan.needsSwap, route: plan.route } : null,
  };
}

export async function listPayments(user: CurrentUser, opts: { limit?: number; since?: Date } = {}): Promise<PaymentView[]> {
  const rows = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.userId, user.id), opts.since ? gte(schema.payments.createdAt, opts.since) : undefined))
    .orderBy(desc(schema.payments.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map(paymentView);
}

export async function getPayment(user: CurrentUser, id: string): Promise<PaymentView> {
  const [row] = await db.select().from(schema.payments).where(and(eq(schema.payments.id, id), eq(schema.payments.userId, user.id))).limit(1);
  if (!row) throw new AgentError("Payment not found.", 404);
  return paymentView(row);
}

export type MonthSummary = {
  month: string;
  sentUsd: number;
  sentInr: number;
  receivedUsd: number;
  receivedInr: number;
  zecSpent: number;
  feesUsd: number;
  count: number;
  byCoin: { coinKey: string; amount: number; usd: number }[];
};

export async function monthSummary(user: CurrentUser, now = new Date()): Promise<MonthSummary> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.userId, user.id), eq(schema.payments.status, "done"), gte(schema.payments.createdAt, start), lt(schema.payments.createdAt, new Date(now.getTime() + 1000))));
  const s: MonthSummary = { month: start.toISOString().slice(0, 7), sentUsd: 0, sentInr: 0, receivedUsd: 0, receivedInr: 0, zecSpent: 0, feesUsd: 0, count: rows.length, byCoin: [] };
  const byCoin = new Map<string, { amount: number; usd: number }>();
  for (const r of rows) {
    if (r.kind === "swap") continue; // conversions inside the wallet aren't spending
    if (r.direction === "out") {
      s.sentUsd += r.usdValue ?? 0;
      s.sentInr += r.inrValue ?? 0;
      if (r.fundCoinKey === "zec") s.zecSpent += Number(r.fundAmount ?? 0);
      s.feesUsd += r.feeUsd ?? 0;
      const b = byCoin.get(r.coinKey) ?? { amount: 0, usd: 0 };
      b.amount += Number(r.amount);
      b.usd += r.usdValue ?? 0;
      byCoin.set(r.coinKey, b);
    } else {
      s.receivedUsd += r.usdValue ?? 0;
      s.receivedInr += r.inrValue ?? 0;
    }
  }
  s.byCoin = [...byCoin.entries()].map(([coinKey, v]) => ({ coinKey, ...v })).sort((a, b) => b.usd - a.usd);
  return s;
}

/** The whole ledger as CSV (opened in Sheets / Excel). */
export async function ledgerCsv(user: CurrentUser): Promise<string> {
  const rows = await listPayments(user, { limit: 5000 });
  const head = ["date", "direction", "counterparty", "amount", "coin", "chain", "paid_with", "paid_with_amount", "usd", "inr", "fee_usd", "zec_price_usd", "status", "reference", "note"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const c = coin(r.coinKey);
    return [
      r.createdAt,
      r.kind === "swap" ? "swap" : r.direction === "out" ? "sent" : "received",
      r.counterparty,
      r.amount,
      c.symbol,
      c.chainName,
      coin(r.fundCoinKey).symbol,
      r.fundAmount,
      r.usd?.toFixed(2),
      r.inr?.toFixed(2),
      r.feeUsd?.toFixed(4),
      r.zecUsd?.toFixed(2),
      r.status,
      r.reference,
      r.note,
    ]
      .map(esc)
      .join(",");
  });
  return [head.join(","), ...lines].join("\n");
}

// ---------- Errors ----------

export function friendlyCode(code: string, symbol: string): string {
  switch (code) {
    case "insufficient_balance":
      return `Your wallet doesn't hold enough ${symbol}.`;
    case "spend_budget_exceeded":
      return "This would go over your daily limit. Try a smaller amount or wait for it to reset.";
    case "policy_destination_denied":
      return "This payee isn't approved in your wallet rules yet.";
    case "policy_asset_denied":
      return `Your wallet rules don't allow ${symbol} yet. Approve a payee to upgrade them.`;
    case "policy_action_denied":
      return "Your wallet rules don't allow this kind of payment yet. Approve a payee to upgrade them.";
    case "amount_too_low":
      return "That amount is too small for this route.";
    case "wallet_busy":
      return "Your wallet is finishing another payment. It will continue in a moment.";
    case "high_fee":
      return "Fees are high for this amount (over 5%).";
    case "recipient_storage_unregistered":
      return "That NEAR account can't receive this token yet.";
    case "spend_price_unavailable":
    case "market_price_unavailable":
      return `No fresh price for ${symbol} right now. Try again in a minute.`;
    default:
      return code.replaceAll("_", " ");
  }
}

export function explain(e: unknown, symbol: string): AgentError {
  if (e instanceof AgentError) return e;
  if (e instanceof AgentApiError) {
    const msg = e.code ? friendlyCode(e.code, symbol) : (e.detail ?? e.message);
    return new AgentError(msg, e.status >= 400 && e.status < 500 ? 400 : 502);
  }
  return new AgentError("Couldn't reach NEAR Intents. Please try again.", 502);
}

export type { Rates };
