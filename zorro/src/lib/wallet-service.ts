// The Zorro wallet: balances and adding funds (deposit addresses). Server-side only.
// Paying out lives in payments.ts; every payee must be approved (payees.ts).

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getBalances, getPolicy, operationStatus, requestDeposit, type Operation } from "./agent-api";
import { AgentError, activeAgentFor } from "./agent-service";
import { COINS, COIN_KEYS, coin, coinByAssetId, fromUnits, paymentUri, toUnits } from "./coins";
import { newIdempotencyKey } from "./crypto";
import { explain } from "./payments";
import { getRates } from "./rates";
import type { CurrentUser } from "./session";

async function requireAgent(user: CurrentUser) {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your Zorro wallet first.", 409);
  return agent;
}

// ---------- Balances ----------

export type WalletBalances = {
  totalUsd: number;
  totalInr: number;
  usdInr: number;
  zecUsd: number | null;
  /** ZEC first (always), then every other coin with a balance. */
  coins: { key: string; symbol: string; name: string; chainName: string; amount: string; usd: number | null; inr: number | null }[];
  limit: { limitUsd: string | null; spentUsd: string | null; remainingUsd: string | null; resetsAt: string | null } | null;
};

export async function balancesFor(user: CurrentUser): Promise<WalletBalances> {
  const agent = await requireAgent(user);
  const [{ balances }, rates, policy] = await Promise.all([getBalances(agent.id), getRates().catch(() => null), getPolicy(agent.id).catch(() => null)]);
  const usdInr = rates?.usdInr ?? 0;

  const coins: WalletBalances["coins"] = [];
  for (const c of COINS) {
    const raw = balances.find((b) => b.asset_id === c.assetId)?.balance_raw ?? "0";
    if (c.key !== "zec" && BigInt(raw) === BigInt(0)) continue;
    const amount = fromUnits(raw, c.decimals);
    const price = rates?.usd[c.key];
    const usd = price === undefined ? null : Number(amount) * price;
    coins.push({ key: c.key, symbol: c.symbol, name: c.name, chainName: c.chainName, amount, usd, inr: usd === null ? null : usd * usdInr });
  }
  const totalUsd = coins.reduce((s, c) => s + (c.usd ?? 0), 0);
  const daily = policy?.usage?.budget.daily;
  return {
    totalUsd,
    totalInr: totalUsd * usdInr,
    usdInr,
    zecUsd: rates?.zecUsd ?? null,
    coins,
    limit: daily ? { limitUsd: daily.limit_usd, spentUsd: daily.spent_usd, remainingUsd: daily.remaining_usd, resetsAt: daily.resets_at } : null,
  };
}

// ---------- Add funds (deposit addresses) ----------

export const DepositInputSchema = z.object({ coinKey: z.enum(COIN_KEYS) });

export type DepositInfo = {
  correlationId: string;
  coinKey: string;
  depositAddress: string;
  memo: string | null;
  minAmount: string;
  expiresAt: string | null;
  status: string;
};

/** A one-time address for adding `coinKey` to the wallet (it credits the confidential balance). */
export async function createDeposit(user: CurrentUser, coinKey: string): Promise<DepositInfo> {
  const agent = await requireAgent(user);
  const c = coin(coinKey);
  const idempotencyKey = newIdempotencyKey("deposit");
  const request = { origin_asset: c.assetId };
  await db.insert(schema.operations).values({ idempotencyKey, agentId: agent.id, kind: "deposit", status: "SENDING", request });

  let op: Operation;
  try {
    op = await requestDeposit(agent.id, request, idempotencyKey);
  } catch (e) {
    await db.update(schema.operations).set({ status: "FAILED" }).where(eq(schema.operations.idempotencyKey, idempotencyKey));
    throw explain(e, c.symbol);
  }
  const d = (op.details ?? {}) as Record<string, unknown>;
  const depositAddress = typeof d.deposit_address === "string" ? d.deposit_address : null;
  await db
    .update(schema.operations)
    .set({ correlationId: op.correlation_id, status: op.status, response: op as Record<string, unknown> })
    .where(eq(schema.operations.idempotencyKey, idempotencyKey));
  // Never show an address the API didn't return.
  if (!depositAddress || !op.correlation_id) throw new AgentError("NEAR Intents didn't return a deposit address. Send nothing and try again.", 502);

  return {
    correlationId: op.correlation_id,
    coinKey: c.key,
    depositAddress,
    memo: typeof d.memo === "string" ? d.memo : null,
    minAmount: fromUnits(String(d.min_amount ?? "0"), c.decimals),
    expiresAt: typeof d.expires_at === "string" ? d.expires_at : null,
    status: op.status,
  };
}

/** A wallet link (QR) for sending `amount` to a deposit address. */
export function depositUri(coinKey: string, address: string, amount: string): string | null {
  const c = coin(coinKey);
  return paymentUri(c, address, toUnits(amount, c.decimals));
}

/** Live status of one of this user's deposits. */
export async function depositStatus(user: CurrentUser, correlationId: string) {
  const agent = await requireAgent(user);
  const [row] = await db
    .select()
    .from(schema.operations)
    .where(and(eq(schema.operations.correlationId, correlationId), eq(schema.operations.agentId, agent.id)))
    .limit(1);
  if (!row) throw new AgentError("Not found.", 404);
  const op = await operationStatus(correlationId).catch(() => null);
  if (op && op.status !== row.status) {
    await db.update(schema.operations).set({ status: op.status, response: op as Record<string, unknown> }).where(eq(schema.operations.idempotencyKey, row.idempotencyKey));
    if (op.status === "SUCCESS") await recordDeposit(row, op);
  }
  return { status: op?.status ?? row.status, failureCode: op?.failure_code ?? null };
}

/** Worker: follow open deposit addresses (up to 4 days old) and add arrivals to the ledger. */
export async function followDeposits(): Promise<number> {
  const since = new Date(Date.now() - 4 * 86_400_000);
  const rows = await db
    .select()
    .from(schema.operations)
    .where(and(eq(schema.operations.kind, "deposit"), inArray(schema.operations.status, ["PENDING_DEPOSIT", "PROCESSING"]), gte(schema.operations.createdAt, since)));
  let n = 0;
  for (const row of rows) {
    if (!row.correlationId) continue;
    const op = await operationStatus(row.correlationId).catch(() => null);
    if (!op || op.status === row.status) continue;
    await db.update(schema.operations).set({ status: op.status, response: op as Record<string, unknown> }).where(eq(schema.operations.idempotencyKey, row.idempotencyKey));
    if (op.status === "SUCCESS") {
      await recordDeposit(row, op);
      n++;
    }
  }
  return n;
}

async function recordDeposit(row: typeof schema.operations.$inferSelect, op: Operation) {
  const [existing] = await db.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.reference, row.correlationId ?? "")).limit(1);
  if (existing) return;
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, row.agentId)).limit(1);
  if (!agent) return;
  const c = coinByAssetId(String(row.request.origin_asset)) ?? coin("zec");
  const d = (op.details ?? {}) as Record<string, unknown>;
  const rawIn = [d.amount_in, d.amount, d.deposit_amount].find((v): v is string => typeof v === "string" && /^\d+$/.test(v));
  const amount = rawIn ? fromUnits(rawIn, c.decimals) : "";
  const rates = await getRates().catch(() => null);
  const usd = rates && amount && rates.usd[c.key] ? Number(amount) * rates.usd[c.key] : null;
  await db.insert(schema.payments).values({
    id: randomUUID(),
    userId: agent.userId,
    agentId: agent.id,
    direction: "in",
    kind: "deposit",
    counterparty: "Added funds",
    coinKey: c.key,
    amount: amount || "0",
    fundCoinKey: c.key,
    fundAmount: amount || null,
    usdValue: usd,
    inrValue: usd !== null && rates ? usd * rates.usdInr : null,
    zecUsd: rates?.zecUsd ?? null,
    reference: row.correlationId,
    note: amount ? null : "Amount shown in your balance",
    status: "done",
    completedAt: new Date(),
  });
}

/** Recent deposit addresses (for the Receive screen). */
export async function recentDeposits(user: CurrentUser) {
  const agent = await activeAgentFor(user.id);
  if (!agent) return [];
  const rows = await db
    .select()
    .from(schema.operations)
    .where(and(eq(schema.operations.agentId, agent.id), eq(schema.operations.kind, "deposit")))
    .orderBy(desc(schema.operations.createdAt))
    .limit(10);
  return rows.map((r) => ({ correlationId: r.correlationId, status: r.status, coinKey: coinByAssetId(String(r.request.origin_asset))?.key ?? "zec", at: r.createdAt.toISOString() }));
}
