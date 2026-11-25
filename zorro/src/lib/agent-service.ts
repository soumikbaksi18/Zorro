// The user's bot wallet: a NEAR Intents agent owned by their passkey. Server-side only.
//
// Flow (one passkey signature):
//   prepareAgentCreate → user signs intent.payload with their passkey → submitAgentCreate
// The same signature installs the policy AND authorizes Zorro's grant (bot permission).

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { STABLECOINS, ZEC } from "./assets";
import { isEvmAddress, isSolanaAddress, zcashAddressKind } from "./addresses";
import {
  AgentApiError,
  generateIntent,
  getAgent,
  intentStatus,
  quoteAgentSwap,
  submitIntent,
  type AgentPolicy,
  type Operation,
} from "./agent-api";
import { decryptSecret, encryptSecret, newGrantToken, newIdempotencyKey, sha256Hex } from "./crypto";
import type { CurrentUser } from "./session";

export class AgentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const GRANT_LABEL = "Zorro bots";
const GRANT_DAYS = 180;
const MAX_ACTIONS_PER_HOUR = 20;
const LIMIT_ORDER_MAX_DEVIATION_BPS = 100;

// ---------- Policy ----------

export const PolicyInputSchema = z.object({
  /** Most the bots may trade per day, in USD (the Agent API enforces it). */
  dailyBudgetUsd: z.string().regex(/^[1-9]\d{0,4}(\.\d{1,2})?$/, "Daily budget must be between $1 and $99,999"),
  /** Where ZEC may be withdrawn: required, so profits can always come home. */
  withdrawZec: z
    .string()
    .trim()
    .refine((a) => zcashAddressKind(a) !== null, "Enter your Zcash address"),
  withdrawUsdcBase: z
    .string()
    .trim()
    .optional()
    .refine((a) => !a || isEvmAddress(a), "That isn't a Base address"),
  withdrawUsdcSol: z
    .string()
    .trim()
    .optional()
    .refine((a) => !a || isSolanaAddress(a), "That isn't a Solana address"),
});
export type PolicyInput = z.infer<typeof PolicyInputSchema>;

type Destination = { action: "withdraw"; chain: string; address: string; memo: null };

/** Turn the user's choices into the complete Agent API policy they will sign. */
export function buildPolicy(input: PolicyInput): AgentPolicy {
  const destinations: Destination[] = [{ action: "withdraw", chain: "zec", address: input.withdrawZec, memo: null }];
  if (input.withdrawUsdcBase) {
    destinations.push({ action: "withdraw", chain: "base", address: input.withdrawUsdcBase.toLowerCase(), memo: null });
  }
  if (input.withdrawUsdcSol) {
    destinations.push({ action: "withdraw", chain: "sol", address: input.withdrawUsdcSol, memo: null });
  }
  return {
    frozen: false,
    actions: ["swap", "limit_order", "withdraw"],
    confidential: true, // private balances; also required for limit orders
    owner_approval: false, // true would make every bot trade wait for Face ID
    assets: [ZEC.assetId, ...STABLECOINS.map((s) => s.assetId)],
    limits: {},
    max_actions_per_hour: MAX_ACTIONS_PER_HOUR,
    destinations: { mode: "only", list: destinations },
    budget: { daily_usd: input.dailyBudgetUsd, weekly_usd: null, monthly_usd: null },
    timelock_ms: 0,
    limit_order: { max_deviation_bps: LIMIT_ORDER_MAX_DEVIATION_BPS },
  };
}

// ---------- Create (step 1: prepare) ----------

export type PreparedIntent = {
  correlationId: string;
  agentId: string;
  /** WebAuthn request options for @simplewebauthn/browser startAuthentication. */
  webauthnOptions: Record<string, unknown>;
  summary: string;
  expiresAt: string;
};

/** The user's active bot wallet and Zorro's grant token for it (decrypted, server memory only). */
export async function agentWithGrant(user: CurrentUser) {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your bot wallet first.", 409);
  const [grant] = await db
    .select()
    .from(schema.grants)
    .where(eq(schema.grants.agentId, agent.id))
    .orderBy(desc(schema.grants.createdAt))
    .limit(1);
  if (!grant || grant.revokedAt || grant.expiresAt < new Date()) {
    throw new AgentError("Zorro's bot permission is missing or expired.", 409);
  }
  return { agent, grantToken: decryptSecret(grant.tokenCiphertext, agent.id) };
}

export async function activeAgentFor(userId: string) {
  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(and(eq(schema.agents.userId, userId), inArray(schema.agents.status, ["PENDING", "ACTIVE"])))
    .orderBy(desc(schema.agents.createdAt))
    .limit(1);
  return agent ?? null;
}

export async function prepareAgentCreate(user: CurrentUser, currentOrigin: string, input: PolicyInput): Promise<PreparedIntent> {
  if (currentOrigin !== user.origin) {
    // A passkey only works on the site it was made for.
    throw new AgentError(`Your passkey belongs to ${user.origin}. Open Zorro there to create your bot wallet.`, 409);
  }
  if (await activeAgentFor(user.id)) throw new AgentError("You already have a bot wallet.", 409);

  const policy = buildPolicy(input);
  const token = newGrantToken();
  const tokenHash = sha256Hex(token);
  const grantExpiresAt = new Date(Date.now() + GRANT_DAYS * 86_400_000);

  let generated;
  try {
    generated = await generateIntent(
      {
        type: "agent_create",
        name: "Zorro bots",
        external_user_id: user.id,
        owner: {
          type: "passkey",
          credential_id: user.passkeyCredentialId,
          public_key: user.passkeyPublicKey,
          rp_id: user.rpId,
          origin: user.origin,
        },
        policy,
        grant: { label: GRANT_LABEL, credential: tokenHash, expires_at: grantExpiresAt.toISOString() },
      },
      newIdempotencyKey("create"),
    );
  } catch (e) {
    throw friendly(e);
  }
  if (generated.intent.standard !== "webauthn") throw new AgentError("Unexpected signing method from NEAR Intents.", 502);

  const grantPreview = (generated.preview as { grant?: { grant_id?: string } }).grant;
  await db.insert(schema.pendingIntents).values({
    correlationId: generated.correlation_id,
    userId: user.id,
    agentId: generated.agent_id,
    type: "agent_create",
    intent: generated.intent as Record<string, unknown>,
    policy: policy as unknown as Record<string, unknown>,
    grantId: grantPreview?.grant_id ?? null,
    grantLabel: GRANT_LABEL,
    // Bound to this agent ID: the ciphertext is useless for any other agent.
    grantTokenCiphertext: encryptSecret(token, generated.agent_id),
    grantTokenHash: tokenHash,
    grantExpiresAt,
    expiresAt: new Date(generated.expires_at),
  });

  return {
    correlationId: generated.correlation_id,
    agentId: generated.agent_id,
    webauthnOptions: generated.intent.payload,
    summary: generated.preview.summary,
    expiresAt: generated.expires_at,
  };
}

// ---------- Create (step 2: submit the passkey signature) ----------

export type CreateResult =
  | { status: "ACTIVE"; agentId: string }
  | { status: "PROCESSING"; correlationId: string }
  | { status: "FAILED"; reason: string };

export async function submitAgentCreate(
  user: CurrentUser,
  correlationId: string,
  credential: Record<string, unknown>,
): Promise<CreateResult> {
  const pending = await pendingFor(user, correlationId);
  if (pending.expiresAt < new Date()) throw new AgentError("This request expired. Please start again.", 410);

  // Rebuild signed_data from the stored intent: the browser only contributes the signature.
  const signedData = { ...pending.intent, credential };
  try {
    await submitIntent({ type: pending.type, correlation_id: correlationId, signed_data: signedData });
  } catch (e) {
    throw friendly(e);
  }
  return waitForAgent(user, correlationId);
}

/** Poll settlement (up to ~90s), then store the agent and its grant. Safe to call again. */
export async function waitForAgent(user: CurrentUser, correlationId: string): Promise<CreateResult> {
  const pending = await pendingFor(user, correlationId);
  let op: Operation | null = null;
  for (let i = 0; i < 3; i++) {
    op = await intentStatus(correlationId, 30_000).catch(() => null);
    if (op && (op.status === "SUCCESS" || op.status === "FAILED" || op.status === "REFUNDED")) break;
  }
  if (!op || !["SUCCESS", "FAILED", "REFUNDED"].includes(op.status)) return { status: "PROCESSING", correlationId };
  if (op.status !== "SUCCESS") {
    await db.delete(schema.pendingIntents).where(eq(schema.pendingIntents.correlationId, correlationId));
    return { status: "FAILED", reason: op.failure_code ?? "NEAR Intents couldn't create the wallet" };
  }

  const agent = await getAgent(pending.agentId);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.agents)
      .values({
        id: agent.id,
        userId: user.id,
        name: agent.name,
        status: agent.status,
        nearAccountId: agent.wallet?.near_account_id ?? null,
        policy: pending.policy,
        policyRevision: Number((op.details as { revision?: unknown } | undefined)?.revision ?? 1) || 1,
      })
      .onConflictDoNothing();
    if (pending.grantId && pending.grantTokenCiphertext && pending.grantTokenHash && pending.grantExpiresAt) {
      await tx
        .insert(schema.grants)
        .values({
          id: pending.grantId,
          agentId: agent.id,
          label: pending.grantLabel ?? GRANT_LABEL,
          tokenCiphertext: pending.grantTokenCiphertext,
          tokenHash: pending.grantTokenHash,
          expiresAt: pending.grantExpiresAt,
        })
        .onConflictDoNothing();
    }
    await tx.delete(schema.pendingIntents).where(eq(schema.pendingIntents.correlationId, correlationId));
  });
  return { status: "ACTIVE", agentId: agent.id };
}

async function pendingFor(user: CurrentUser, correlationId: string) {
  const [pending] = await db
    .select()
    .from(schema.pendingIntents)
    .where(and(eq(schema.pendingIntents.correlationId, correlationId), eq(schema.pendingIntents.userId, user.id)))
    .limit(1);
  // Never act on a correlation ID from the browser without checking it belongs to this user.
  if (!pending) throw new AgentError("Request not found.", 404);
  return pending;
}

// ---------- Read ----------

export type AgentSummary = {
  id: string;
  name: string;
  status: string;
  nearAccountId: string | null;
  createdAt: string;
  dailyBudgetUsd: string | null;
  maxActionsPerHour: number | null;
  withdrawTo: { chain: string; address: string }[];
  grant: { label: string; expiresAt: string; revoked: boolean } | null;
};

export async function agentSummaryFor(user: CurrentUser): Promise<AgentSummary | null> {
  const agent = await activeAgentFor(user.id);
  if (!agent) return null;
  const [grant] = await db
    .select()
    .from(schema.grants)
    .where(eq(schema.grants.agentId, agent.id))
    .orderBy(desc(schema.grants.createdAt))
    .limit(1);
  const policy = agent.policy as unknown as AgentPolicy | null;
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    nearAccountId: agent.nearAccountId,
    createdAt: agent.createdAt.toISOString(),
    dailyBudgetUsd: policy?.budget.daily_usd ?? null,
    maxActionsPerHour: policy?.max_actions_per_hour ?? null,
    withdrawTo: ((policy?.destinations.list ?? []) as Destination[]).map((d) => ({ chain: d.chain, address: d.address })),
    grant: grant
      ? { label: grant.label, expiresAt: grant.expiresAt.toISOString(), revoked: grant.revokedAt !== null }
      : null,
  };
}

/** Refresh the agent's status from NEAR Intents (e.g. PENDING → ACTIVE). */
export async function refreshAgent(user: CurrentUser): Promise<AgentSummary | null> {
  const agent = await activeAgentFor(user.id);
  if (agent) {
    const live = await getAgent(agent.id).catch(() => null);
    if (live && live.status !== agent.status) {
      await db.update(schema.agents).set({ status: live.status }).where(eq(schema.agents.id, agent.id));
    }
  }
  return agentSummaryFor(user);
}

/**
 * Prove Zorro's grant works: ask for a dry-run swap quote under the grant.
 * A dry run never moves money. An empty wallet may still be refused for balance,
 * which proves the grant was accepted; only grant/auth errors mean it doesn't work.
 */
export async function checkGrant(user: CurrentUser): Promise<{ ok: boolean; detail: string }> {
  const agent = await activeAgentFor(user.id);
  if (!agent) return { ok: false, detail: "No bot wallet yet" };
  const [grant] = await db.select().from(schema.grants).where(eq(schema.grants.agentId, agent.id)).limit(1);
  if (!grant || grant.revokedAt) return { ok: false, detail: "No active bot permission" };

  const token = decryptSecret(grant.tokenCiphertext, agent.id);
  try {
    await quoteAgentSwap(
      agent.id,
      { origin_asset: STABLECOINS[0].assetId, destination_asset: ZEC.assetId, amount: "1000000" },
      token,
    );
    return { ok: true, detail: "Bot permission accepted by NEAR Intents" };
  } catch (e) {
    if (e instanceof AgentApiError && (e.status === 401 || e.status === 403 || e.code?.startsWith("grant"))) {
      return { ok: false, detail: `Rejected: ${e.code ?? e.status}` };
    }
    if (e instanceof AgentApiError) return { ok: true, detail: `Bot permission accepted (quote said: ${e.code ?? e.status})` };
    return { ok: false, detail: "Couldn't reach NEAR Intents" };
  }
}

function friendly(e: unknown): AgentError {
  if (e instanceof AgentApiError) {
    const detail = e.detail ?? e.message;
    if (e.code === "intent_expired") return new AgentError("The signing window expired. Please try again.", 410);
    if (e.code === "signer_mismatch") return new AgentError("That passkey doesn't match your Zorro account.", 409);
    if (e.status === 429) return new AgentError("NEAR Intents is busy. Please try again in a minute.", 429);
    return new AgentError(`NEAR Intents: ${detail}`, e.status >= 400 && e.status < 600 ? e.status : 502);
  }
  return new AgentError("Couldn't reach NEAR Intents. Please try again.", 502);
}
