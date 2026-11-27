// Payees: the only people and places Zorro can pay. Server-side only.
//
// Adding a payee is free; approving payees takes the owner's passkey (one policy_update
// for every pending payee at once, because NEAR Intents allows one rules change per
// 10 minutes). Until approved, the Agent API itself refuses any payment to them.

import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { generateIntent, getPolicy, intentStatus, submitIntent, type AgentPolicy, type PolicyDestination } from "./agent-api";
import { AgentError, activeAgentFor, friendly, pendingFor } from "./agent-service";
import { COINS, COIN_KEYS, canonicalAddress, coin, isValidAddress } from "./coins";
import { newIdempotencyKey } from "./crypto";
import { lookupHandle } from "./handles";
import type { CurrentUser } from "./session";

export const ZORRO_CHAIN = "near-intents";

export type PayeeView = {
  id: string;
  name: string;
  kind: "address" | "zorro";
  coinKey: string;
  chain: string;
  address: string;
  handle: string | null;
  status: "pending" | "approving" | "approved" | "removed";
};

const view = (p: typeof schema.payees.$inferSelect): PayeeView => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  coinKey: p.coinKey,
  chain: p.chain,
  address: p.address,
  handle: p.handle,
  status: p.status,
});

export async function listPayees(user: CurrentUser): Promise<PayeeView[]> {
  const rows = await db
    .select()
    .from(schema.payees)
    .where(and(eq(schema.payees.userId, user.id), ne(schema.payees.status, "removed")))
    .orderBy(schema.payees.name);
  return rows.map(view);
}

export async function payeeFor(user: CurrentUser, id: string) {
  const [row] = await db
    .select()
    .from(schema.payees)
    .where(and(eq(schema.payees.id, id), eq(schema.payees.userId, user.id)))
    .limit(1);
  if (!row || row.status === "removed") throw new AgentError("Payee not found.", 404);
  return row;
}

// ---------- Add / remove ----------

export const AddPayeeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("address"),
    name: z.string().trim().min(1, "Give them a name").max(40),
    coinKey: z.enum(COIN_KEYS),
    address: z.string().trim().min(1, "Enter their address").max(200),
  }),
  z.object({
    kind: z.literal("zorro"),
    name: z.string().trim().max(40).optional(),
    handle: z.string().trim().min(1, "Enter their @handle").max(40),
    coinKey: z.enum(COIN_KEYS).default("zec"),
  }),
]);

function destinationOf(p: { kind: "address" | "zorro"; chain: string; address: string }): PolicyDestination {
  return p.kind === "zorro"
    ? { action: "transfer", address: p.address, confidential: true }
    : { action: "withdraw", chain: p.chain, address: p.address, memo: null };
}

const destKey = (d: PolicyDestination) => (d.action === "transfer" ? `t:${d.address}` : `w:${d.chain}:${d.address}:${d.memo ?? ""}`);

export async function addPayee(user: CurrentUser, input: z.infer<typeof AddPayeeSchema>): Promise<PayeeView> {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your Zorro wallet first.", 409);

  let values: Omit<typeof schema.payees.$inferInsert, "id" | "userId">;
  if (input.kind === "zorro") {
    const found = await lookupHandle(input.handle);
    if (!found) throw new AgentError("No Zorro user with that handle (they need an active wallet).", 404);
    if (found.userId === user.id) throw new AgentError("That's you.");
    values = { name: input.name || `@${found.handle}`, kind: "zorro", coinKey: input.coinKey, chain: ZORRO_CHAIN, address: found.nearAccountId, handle: found.handle };
  } else {
    const c = coin(input.coinKey);
    if (!isValidAddress(c.kind, input.address)) throw new AgentError(`That isn't a valid ${c.chainName} address.`);
    values = { name: input.name, kind: "address", coinKey: c.key, chain: c.chain, address: canonicalAddress(c.kind, input.address), handle: null };
  }

  // Already approved in the signed rules (same address and route)? Then no Face ID is needed.
  const live = (agent.policy as unknown as AgentPolicy | null)?.destinations.list ?? [];
  const approved = live.some((d) => destKey(d) === destKey(destinationOf(values as never)));

  const [existing] = await db
    .select()
    .from(schema.payees)
    .where(and(eq(schema.payees.userId, user.id), eq(schema.payees.chain, values.chain), eq(schema.payees.address, values.address), eq(schema.payees.coinKey, values.coinKey)))
    .limit(1);
  if (existing) {
    const status = approved ? "approved" : existing.status === "removed" ? "pending" : existing.status;
    await db.update(schema.payees).set({ name: values.name, status }).where(eq(schema.payees.id, existing.id));
    return view({ ...existing, name: values.name, status });
  }
  const row = {
    id: randomUUID(),
    userId: user.id,
    ...values,
    status: approved ? ("approved" as const) : ("pending" as const),
    approvedAt: approved ? new Date() : null,
  };
  await db.insert(schema.payees).values(row);
  return view({ ...row, handle: row.handle ?? null, approvedAt: row.approvedAt, createdAt: new Date() } as typeof schema.payees.$inferSelect);
}

/** Hide a payee now. Its address leaves the signed rules at the next approval (Face ID). */
export async function removePayee(user: CurrentUser, id: string): Promise<void> {
  await payeeFor(user, id);
  await db.update(schema.payees).set({ status: "removed" }).where(eq(schema.payees.id, id));
}

// ---------- Approve (owner passkey signs a policy_update) ----------

export type PreparedApproval = {
  correlationId: string;
  webauthnOptions: Record<string, unknown>;
  summary: string;
  count: number;
};

export async function prepareApproval(user: CurrentUser, currentOrigin: string): Promise<PreparedApproval> {
  if (currentOrigin !== user.origin) throw new AgentError(`Your passkey belongs to ${user.origin}. Open Zorro there to approve payees.`, 409);
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your Zorro wallet first.", 409);

  const all = await db.select().from(schema.payees).where(eq(schema.payees.userId, user.id));
  const pending = all.filter((p) => p.status === "pending" || p.status === "approving");
  const keep = all.filter((p) => p.status !== "removed");
  if (pending.length === 0) throw new AgentError("No payees are waiting for approval.");

  const live = await getPolicy(agent.id).catch((e) => {
    throw friendly(e);
  });
  const cooldown = live.cooldowns?.policy_change_available_at;
  if (cooldown && new Date(cooldown) > new Date()) {
    const at = new Date(cooldown).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    throw new AgentError(`NEAR Intents allows one rules change every 10 minutes. You can approve again at ${at}.`, 429);
  }
  const current = (live.policy ?? agent.policy) as unknown as AgentPolicy;
  if (!current || live.revision === undefined) throw new AgentError("Couldn't read your wallet rules. Try again.", 502);

  // New destination list: every payee the user keeps (removed ones drop out).
  const seen = new Set<string>();
  const list: PolicyDestination[] = [];
  for (const p of keep) {
    const d = destinationOf(p);
    if (!seen.has(destKey(d))) {
      seen.add(destKey(d));
      list.push(d);
    }
  }
  const policy: AgentPolicy = {
    ...current,
    // Also upgrades version-1 wallets: payments need transfer, and every coin Zorro supports.
    actions: ["swap", "withdraw", "transfer"],
    assets: COINS.map((c) => c.assetId),
    destinations: { mode: "only", list },
  };
  delete (policy as { limit_order?: unknown }).limit_order;

  let generated;
  try {
    generated = await generateIntent({ type: "policy_update", agent_id: agent.id, policy, expected_revision: live.revision }, newIdempotencyKey("payees"));
  } catch (e) {
    throw friendly(e);
  }
  if (generated.intent.standard !== "webauthn") throw new AgentError("Unexpected signing method from NEAR Intents.", 502);

  await db.insert(schema.pendingIntents).values({
    correlationId: generated.correlation_id,
    userId: user.id,
    agentId: agent.id,
    type: "policy_update",
    intent: generated.intent as Record<string, unknown>,
    policy: policy as unknown as Record<string, unknown>,
    meta: { payeeIds: pending.map((p) => p.id) },
    expiresAt: new Date(generated.expires_at),
  });
  await db.update(schema.payees).set({ status: "approving" }).where(inArray(schema.payees.id, pending.map((p) => p.id)));

  return {
    correlationId: generated.correlation_id,
    webauthnOptions: generated.intent.payload,
    summary: generated.preview.summary,
    count: pending.length,
  };
}

export type ApprovalResult = { status: "APPROVED"; count: number } | { status: "PROCESSING"; correlationId: string } | { status: "FAILED"; reason: string };

/** Submit the passkey signature (once), then wait for the new rules. Safe to call again without a credential. */
export async function submitApproval(user: CurrentUser, correlationId: string, credential?: Record<string, unknown>): Promise<ApprovalResult> {
  const pending = await pendingFor(user, correlationId);
  if (pending.type !== "policy_update") throw new AgentError("Request not found.", 404);
  const payeeIds = ((pending.meta as { payeeIds?: string[] } | null)?.payeeIds ?? []).filter(Boolean);

  if (credential) {
    if (pending.expiresAt < new Date()) throw new AgentError("This request expired. Please start again.", 410);
    try {
      await submitIntent({ type: "policy_update", correlation_id: correlationId, signed_data: { ...pending.intent, credential } });
    } catch (e) {
      await db.update(schema.payees).set({ status: "pending" }).where(and(inArray(schema.payees.id, payeeIds), eq(schema.payees.status, "approving")));
      throw friendly(e);
    }
  }

  let op = null;
  for (let i = 0; i < 2; i++) {
    op = await intentStatus(correlationId, 25_000).catch(() => null);
    if (op && ["SUCCESS", "FAILED", "REFUNDED"].includes(op.status)) break;
  }
  if (!op || !["SUCCESS", "FAILED", "REFUNDED"].includes(op.status)) return { status: "PROCESSING", correlationId };

  if (op.status !== "SUCCESS") {
    await db.update(schema.payees).set({ status: "pending" }).where(and(inArray(schema.payees.id, payeeIds), eq(schema.payees.status, "approving")));
    await db.delete(schema.pendingIntents).where(eq(schema.pendingIntents.correlationId, correlationId));
    return { status: "FAILED", reason: op.failure_code ?? "NEAR Intents didn't apply the new rules" };
  }

  const revision = Number((op.details as { revision?: unknown } | undefined)?.revision);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.agents)
      .set({ policy: pending.policy, ...(Number.isFinite(revision) ? { policyRevision: revision } : {}) })
      .where(eq(schema.agents.id, pending.agentId));
    if (payeeIds.length) {
      await tx.update(schema.payees).set({ status: "approved", approvedAt: new Date() }).where(and(inArray(schema.payees.id, payeeIds), ne(schema.payees.status, "removed")));
    }
    await tx.delete(schema.pendingIntents).where(eq(schema.pendingIntents.correlationId, correlationId));
  });
  return { status: "APPROVED", count: payeeIds.length };
}
