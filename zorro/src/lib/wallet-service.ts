// Funding the bot wallet: balances, deposit addresses, withdrawals, activity. Server-side only.
// Every money action is saved to `operations` with its Idempotency-Key BEFORE it is sent,
// so a crash or timeout is retried with the same key and can never run twice.

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { STABLECOINS, ZEC, fromBaseUnits, toBaseUnits } from "./assets";
import {
  AgentApiError,
  getBalances,
  getPolicy,
  operationStatus,
  previewWithdraw,
  requestDeposit,
  tokens,
  withdraw,
  type AgentPolicy,
  type DryRun,
  type Operation,
} from "./agent-api";
import { AgentError, activeAgentFor, agentWithGrant } from "./agent-service";
import { newIdempotencyKey } from "./crypto";
import { buildPaymentLink, type PaymentLink } from "./payment-links";
import type { CurrentUser } from "./session";

export const WALLET_ASSETS = [
  { key: "zec", assetId: ZEC.assetId, symbol: "ZEC", chain: "zec", chainName: "Zcash", decimals: ZEC.decimals },
  ...STABLECOINS.map((s) => ({ key: s.key, assetId: s.assetId, symbol: s.symbol, chain: s.chain, chainName: s.chainName, decimals: s.decimals })),
] as const;
export type WalletAssetKey = (typeof WALLET_ASSETS)[number]["key"];
export const AssetKeySchema = z.enum(["zec", "usdc-base", "usdc-sol"]);

function asset(key: WalletAssetKey) {
  return WALLET_ASSETS.find((a) => a.key === key)!;
}

async function requireAgent(user: CurrentUser) {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your bot wallet first.", 409);
  return agent;
}

// ---------- Balances ----------

export type WalletBalances = {
  totalUsd: number;
  assets: { key: string; symbol: string; chainName: string; amount: string; usd: number | null }[];
  other: { assetId: string; symbol: string; amount: string }[];
  budget: { limitUsd: string | null; spentUsd: string | null; remainingUsd: string | null; resetsAt: string | null } | null;
};

export async function balancesFor(user: CurrentUser): Promise<WalletBalances> {
  const agent = await requireAgent(user);
  const [{ balances }, prices, policy] = await Promise.all([
    getBalances(agent.id),
    tokens().catch(() => []),
    getPolicy(agent.id).catch(() => null),
  ]);
  const priceOf = (assetId: string) => prices.find((t) => t.asset_id === assetId)?.price ?? null;
  const rawOf = (assetId: string) => balances.find((b) => b.asset_id === assetId)?.balance_raw ?? "0";

  const assets = WALLET_ASSETS.map((a) => {
    const amount = fromBaseUnits(rawOf(a.assetId), a.decimals);
    const price = priceOf(a.assetId);
    return { key: a.key, symbol: a.symbol, chainName: a.chainName, amount, usd: price === null ? null : Number(amount) * price };
  });
  const known = new Set<string>(WALLET_ASSETS.map((a) => a.assetId));
  const other = balances
    .filter((b) => b.asset_id && !known.has(b.asset_id) && b.balance_raw !== "0")
    .map((b) => ({ assetId: b.asset_id!, symbol: b.symbol ?? "?", amount: b.balance ?? b.balance_raw }));
  const daily = policy?.usage?.budget.daily;

  return {
    totalUsd: assets.reduce((sum, a) => sum + (a.usd ?? 0), 0),
    assets,
    other,
    budget: daily
      ? { limitUsd: daily.limit_usd, spentUsd: daily.spent_usd, remainingUsd: daily.remaining_usd, resetsAt: daily.resets_at }
      : null,
  };
}

// ---------- Deposits ----------

export type DepositInfo = {
  correlationId: string;
  asset: WalletAssetKey;
  depositAddress: string;
  memo: string | null;
  minAmount: string; // human units
  expiresAt: string | null;
  status: string;
};

export async function createDeposit(user: CurrentUser, assetKey: WalletAssetKey): Promise<DepositInfo> {
  const agent = await requireAgent(user);
  const a = asset(assetKey);
  const idempotencyKey = newIdempotencyKey("deposit");
  const request = { origin_asset: a.assetId };
  await db.insert(schema.operations).values({ idempotencyKey, agentId: agent.id, kind: "deposit", status: "SENDING", request });

  let op: Operation;
  try {
    op = await requestDeposit(agent.id, request, idempotencyKey);
  } catch (e) {
    await db.update(schema.operations).set({ status: "FAILED" }).where(eq(schema.operations.idempotencyKey, idempotencyKey));
    throw explain(e, a.symbol);
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
    asset: assetKey,
    depositAddress,
    memo: typeof d.memo === "string" ? d.memo : null,
    minAmount: fromBaseUnits(String(d.min_amount ?? "0"), a.decimals),
    expiresAt: typeof d.expires_at === "string" ? d.expires_at : null,
    status: op.status,
  };
}

/** A payment link for a deposit, once the user picks how much to send. */
export function depositPaymentLink(assetKey: WalletAssetKey, depositAddress: string, amount: string): PaymentLink {
  return buildPaymentLink(assetKey, depositAddress, toBaseUnits(amount, asset(assetKey).decimals));
}

// ---------- Withdrawals ----------

export const WithdrawInputSchema = z.object({
  asset: AssetKeySchema,
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter an amount"),
  dry: z.boolean(),
});

export type WithdrawPreview = {
  receiveAmount: string | null;
  feeUsd: string | null;
  feePercent: string | null;
  recipient: string;
  chainName: string;
  problems: string[];
};

function destinationFor(policy: AgentPolicy, chain: string): string {
  const match = (policy.destinations.list as { chain?: string; address?: string }[]).find((d) => d.chain === chain);
  if (!match?.address) throw new AgentError(`Your limits don't include a ${chain} withdrawal address.`, 409);
  return match.address;
}

export async function withdrawFunds(user: CurrentUser, input: z.infer<typeof WithdrawInputSchema>) {
  const { agent, grantToken } = await agentWithGrant(user);
  const a = asset(input.asset);
  const amount = toBaseUnits(input.amount, a.decimals);
  if (BigInt(amount) === BigInt(0)) throw new AgentError("Enter an amount above zero.");
  const recipient = destinationFor(agent.policy as unknown as AgentPolicy, a.chain);
  const body = { asset: a.assetId, amount, chain: a.chain, recipient };
  const idempotencyKey = newIdempotencyKey(input.dry ? "wpreview" : "withdraw");

  if (input.dry) {
    let preview: DryRun;
    try {
      preview = await previewWithdraw(agent.id, body, { grantToken, idempotencyKey });
    } catch (e) {
      throw explain(e, a.symbol);
    }
    const out = preview.quote.amount_out;
    return {
      receiveAmount: out ? fromBaseUnits(out, a.decimals) : null,
      feeUsd: preview.fee?.amount_usd ?? null,
      feePercent: preview.fee?.percent ?? null,
      recipient,
      chainName: a.chainName,
      problems: preview.warnings.map((w) => friendlyCode(w.code, a.symbol)),
    } satisfies WithdrawPreview;
  }

  await db.insert(schema.operations).values({ idempotencyKey, agentId: agent.id, kind: "withdraw", status: "SENDING", request: body });
  try {
    const op = await withdraw(agent.id, { ...body, note: "Withdrawal requested in Zorro" }, { grantToken, idempotencyKey });
    await db
      .update(schema.operations)
      .set({ correlationId: op.correlation_id, status: op.status, response: op as Record<string, unknown> })
      .where(eq(schema.operations.idempotencyKey, idempotencyKey));
    return { correlationId: op.correlation_id, status: op.status };
  } catch (e) {
    // A definite refusal means nothing was sent; anything else stays SENDING for a same-key retry.
    if (e instanceof AgentApiError && e.status >= 400 && e.status < 500) {
      await db.update(schema.operations).set({ status: "FAILED" }).where(eq(schema.operations.idempotencyKey, idempotencyKey));
    }
    throw explain(e, a.symbol);
  }
}

// ---------- Status & activity ----------

/** Live status of one of this user's operations (deposit, withdrawal, bot trade). */
export async function operationFor(user: CurrentUser, correlationId: string) {
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
  }
  return { status: op?.status ?? row.status, failureCode: op?.failure_code ?? null, kind: row.kind };
}

export type ActivityItem = { at: string; kind: string; status: string; summary: string; correlationId: string | null };

export async function activityFor(user: CurrentUser): Promise<ActivityItem[]> {
  const agent = await activeAgentFor(user.id);
  if (!agent) return [];
  const rows = await db
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.agentId, agent.id))
    .orderBy(desc(schema.operations.createdAt))
    .limit(40);
  return rows.map((r) => ({ at: r.createdAt.toISOString(), kind: r.kind, status: r.status, summary: summarize(r.kind, r.request), correlationId: r.correlationId }));
}

function summarize(kind: string, request: Record<string, unknown>): string {
  const a = WALLET_ASSETS.find((x) => x.assetId === (request.asset ?? request.origin_asset));
  const amount = typeof request.amount === "string" && a ? `${fromBaseUnits(request.amount, a.decimals)} ` : "";
  if (kind === "deposit") return `Deposit address for ${a?.symbol ?? "funds"}${a ? ` on ${a.chainName}` : ""}`;
  if (kind === "withdraw") return `Withdraw ${amount}${a?.symbol ?? ""}`;
  if (kind === "swap") {
    const to = WALLET_ASSETS.find((x) => x.assetId === request.destination_asset);
    return `Bot swap ${amount}${a?.symbol ?? ""} → ${to?.symbol ?? "?"}`;
  }
  return kind;
}

// ---------- Errors ----------

function friendlyCode(code: string, symbol: string): string {
  switch (code) {
    case "insufficient_balance":
      return `Your bot wallet doesn't hold enough ${symbol}.`;
    case "spend_budget_exceeded":
      return "This would go over your daily budget. Try a smaller amount or wait for it to reset.";
    case "policy_destination_denied":
      return "That address isn't in your signed limits.";
    case "amount_too_low":
      return "Amount too low for this route.";
    case "wallet_busy":
      return "Your bot wallet is finishing another action. Try again in a moment.";
    default:
      return code.replaceAll("_", " ");
  }
}

function explain(e: unknown, symbol: string): AgentError {
  if (e instanceof AgentError) return e;
  if (e instanceof AgentApiError) {
    const msg = e.code ? friendlyCode(e.code, symbol) : (e.detail ?? e.message);
    return new AgentError(msg, e.status >= 400 && e.status < 500 ? 400 : 502);
  }
  return new AgentError("Couldn't reach NEAR Intents. Please try again.", 502);
}
