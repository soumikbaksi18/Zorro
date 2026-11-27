// Get paid: a link anyone can pay in any supported coin. The payer gets a one-time deposit
// address for their coin; NEAR Intents converts it to ZEC on arrival and credits the wallet.
// Server-side only. The public page shows the amount, the note and the @handle, nothing else.

import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AgentApiError, operationStatus, requestDeposit } from "./agent-api";
import { AgentError, activeAgentFor, friendly } from "./agent-service";
import { COINS, COIN_KEYS, ZEC_COIN, ceilDecimal, coin, fromUnits, paymentUri, toUnits } from "./coins";
import { getRates, priceOf, toUsd } from "./rates";
import type { CurrentUser } from "./session";

const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newRequestId = () =>
  Array.from(randomBytes(10))
    .map((b) => ID_ALPHABET[b % ID_ALPHABET.length])
    .join("");

export const RequestInputSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Enter an amount")
    .refine((a) => Number(a) > 0, "Enter an amount above zero"),
  currency: z.enum(["USD", "INR", "ZEC"]),
  note: z.string().trim().max(120).optional(),
});

export type RequestView = {
  id: string;
  amount: string;
  currency: "USD" | "INR" | "ZEC";
  note: string | null;
  status: string;
  payCoinKey: string | null;
  createdAt: string;
  paidAt: string | null;
};

const view = (r: typeof schema.paymentRequests.$inferSelect): RequestView => ({
  id: r.id,
  amount: r.amount,
  currency: r.currency,
  note: r.note,
  status: r.status,
  payCoinKey: r.payCoinKey,
  createdAt: r.createdAt.toISOString(),
  paidAt: r.paidAt?.toISOString() ?? null,
});

export async function createRequest(user: CurrentUser, input: z.infer<typeof RequestInputSchema>): Promise<RequestView> {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your Zorro wallet first.", 409);
  const row = { id: newRequestId(), userId: user.id, agentId: agent.id, amount: input.amount, currency: input.currency, note: input.note || null, status: "open" as const };
  await db.insert(schema.paymentRequests).values(row);
  return view({ ...row, payCoinKey: null, payAmountUnits: null, depositAddress: null, depositMemo: null, depositCorrelationId: null, depositExpiresAt: null, paidAt: null, createdAt: new Date() });
}

export async function listRequests(user: CurrentUser): Promise<RequestView[]> {
  const rows = await db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.userId, user.id)).orderBy(desc(schema.paymentRequests.createdAt)).limit(50);
  return rows.map(view);
}

export async function cancelRequest(user: CurrentUser, id: string) {
  await db
    .update(schema.paymentRequests)
    .set({ status: "cancelled" })
    .where(and(eq(schema.paymentRequests.id, id), eq(schema.paymentRequests.userId, user.id), inArray(schema.paymentRequests.status, ["open", "pending"])));
}

// ---------- Public (the payer's side) ----------

export type PublicRequest = {
  id: string;
  to: string;
  amount: string;
  currency: string;
  note: string | null;
  status: string;
  usd: number | null;
  coins: { key: string; symbol: string; chainName: string; amount: string | null }[];
  deposit: { coinKey: string; address: string; memo: string | null; amount: string; uri: string | null; expiresAt: string | null } | null;
};

async function requestRow(id: string) {
  const [row] = await db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.id, id)).limit(1);
  if (!row) throw new AgentError("This payment link doesn't exist.", 404);
  return row;
}

export async function publicRequest(id: string): Promise<PublicRequest> {
  let row = await requestRow(id);
  if (row.status === "pending") row = (await refreshRequest(row)) ?? row;
  const [owner] = await db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, row.userId)).limit(1);
  const rates = await getRates().catch(() => null);
  const usd = rates ? toUsd(rates, Number(row.amount), row.currency) : null;
  const coins = COINS.map((c) => {
    let amount: string | null = null;
    if (rates && usd !== null) {
      try {
        amount = ceilDecimal(usd / priceOf(rates, c), c.decimals);
      } catch {}
    }
    return { key: c.key, symbol: c.symbol, chainName: c.chainName, amount };
  });
  const deposit =
    row.status === "pending" && row.depositAddress && row.payCoinKey && row.payAmountUnits
      ? {
          coinKey: row.payCoinKey,
          address: row.depositAddress,
          memo: row.depositMemo,
          amount: fromUnits(row.payAmountUnits, coin(row.payCoinKey).decimals),
          uri: row.depositMemo ? null : paymentUri(coin(row.payCoinKey), row.depositAddress, row.payAmountUnits),
          expiresAt: row.depositExpiresAt?.toISOString() ?? null,
        }
      : null;
  return { id: row.id, to: owner?.handle ? `@${owner.handle}` : "a Zorro user", amount: row.amount, currency: row.currency, note: row.note, status: row.status, usd, coins, deposit };
}

export const PayRequestSchema = z.object({ coinKey: z.enum(COIN_KEYS) });

/** The payer picked a coin: create (or reuse) a deposit address that converts to ZEC on arrival. */
export async function startRequestPayment(id: string, coinKey: string): Promise<PublicRequest> {
  const row = await requestRow(id);
  if (row.status === "paid") throw new AgentError("This link has already been paid.", 409);
  if (row.status === "cancelled" || row.status === "expired") throw new AgentError("This link is no longer active.", 410);
  const notExpired = row.depositExpiresAt ? row.depositExpiresAt > new Date() : true;
  if (row.status === "pending" && row.payCoinKey === coinKey && notExpired) return publicRequest(id);

  const c = coin(coinKey);
  const rates = await getRates().catch(() => {
    throw new AgentError("Prices are unavailable right now. Try again in a minute.", 503);
  });
  let units: string;
  try {
    const usd = toUsd(rates, Number(row.amount), row.currency);
    units = toUnits(ceilDecimal((usd / priceOf(rates, c)) * 1.005, c.decimals), c.decimals); // +0.5% for the conversion fee
  } catch (e) {
    throw new AgentError(e instanceof Error ? e.message : "No price for this coin", 503);
  }

  let op;
  try {
    op = await requestDeposit(
      row.agentId,
      {
        origin_asset: c.assetId,
        amount: units,
        ...(c.key === ZEC_COIN.key ? {} : { destination_asset: ZEC_COIN.assetId }),
        note: `Zorro payment link ${row.id}`,
      },
      `req-${row.id}-${c.key}-${Date.now()}`, // a fresh address per attempt; old ones simply expire
    );
  } catch (e) {
    if (e instanceof AgentApiError && e.code === "amount_too_low") throw new AgentError(`That amount is too small to pay in ${c.symbol}. Try another coin.`);
    throw friendly(e);
  }
  const d = (op.details ?? {}) as Record<string, unknown>;
  const address = typeof d.deposit_address === "string" ? d.deposit_address : null;
  if (!address || !op.correlation_id) throw new AgentError("NEAR Intents didn't return a deposit address. Send nothing and try again.", 502);
  await db
    .update(schema.paymentRequests)
    .set({
      status: "pending",
      payCoinKey: c.key,
      payAmountUnits: typeof d.min_amount === "string" ? d.min_amount : units,
      depositAddress: address,
      depositMemo: typeof d.memo === "string" ? d.memo : null,
      depositCorrelationId: op.correlation_id,
      depositExpiresAt: typeof d.expires_at === "string" ? new Date(d.expires_at) : null,
    })
    .where(eq(schema.paymentRequests.id, row.id));
  return publicRequest(id);
}

/** Check a pending link's deposit; when it settles, mark it paid and add it to the ledger. */
export async function refreshRequest(row: typeof schema.paymentRequests.$inferSelect) {
  if (row.status !== "pending" || !row.depositCorrelationId) return null;
  const op = await operationStatus(row.depositCorrelationId).catch(() => null);
  if (!op) return null;
  if (op.status === "SUCCESS") {
    const rates = await getRates().catch(() => null);
    const usd = rates ? toUsd(rates, Number(row.amount), row.currency) : null;
    const payCoin = coin(row.payCoinKey ?? "zec");
    const d = (op.details ?? {}) as Record<string, unknown>;
    const zecOut = typeof d.amount_out === "string" && /^\d+$/.test(d.amount_out) ? fromUnits(d.amount_out, 8) : rates && usd !== null ? (usd / rates.zecUsd).toFixed(8) : "0";
    const updated = await db
      .update(schema.paymentRequests)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(schema.paymentRequests.id, row.id), eq(schema.paymentRequests.status, "pending")))
      .returning();
    if (updated.length) {
      await db.insert(schema.payments).values({
        id: randomUUID(),
        userId: row.userId,
        agentId: row.agentId,
        direction: "in",
        kind: "request",
        requestId: row.id,
        counterparty: row.note ? `Payment link: ${row.note}` : "Payment link",
        coinKey: "zec",
        amount: zecOut,
        fundCoinKey: payCoin.key,
        fundAmount: row.payAmountUnits ? fromUnits(row.payAmountUnits, payCoin.decimals) : null,
        usdValue: usd,
        inrValue: usd !== null && rates ? usd * rates.usdInr : null,
        zecUsd: rates?.zecUsd ?? null,
        reference: row.id,
        status: "done",
        completedAt: new Date(),
      });
    }
    return updated[0] ?? null;
  }
  if (op.status === "REFUNDED" || op.status === "FAILED") {
    // Nothing arrived (or it was returned): the link can be paid again with a fresh address.
    const [updated] = await db
      .update(schema.paymentRequests)
      .set({ status: "open", depositAddress: null, depositCorrelationId: null, payCoinKey: null, payAmountUnits: null, depositExpiresAt: null })
      .where(eq(schema.paymentRequests.id, row.id))
      .returning();
    return updated ?? null;
  }
  return null;
}

/** Worker: follow every pending link. */
export async function refreshPendingRequests(): Promise<number> {
  const rows = await db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.status, "pending"));
  let paid = 0;
  for (const r of rows) {
    const updated = await refreshRequest(r).catch(() => null);
    if (updated?.status === "paid") paid++;
  }
  return paid;
}
