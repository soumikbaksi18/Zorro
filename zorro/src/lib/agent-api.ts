// Typed client for the NEAR Intents Agent API. Server-side only.
// Spec: https://api.agentsonintents.com/openapi.json
//
// Who signs what:
// - Partner API key (X-API-Key): every call except public ones.
// - Owner (the user's passkey): signs intents built by generateIntent(), e.g. agent_create.
// - Grant token (X-Grant-Token): Zorro's permission to trade within the owner's policy.
// - Idempotency-Key: required on live money actions; retry with the SAME key, never a new one.

import { z } from "zod";

const BASE_URL = process.env.AGENT_API_BASE_URL ?? "https://api.agentsonintents.com";

export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly detail: string | null,
    readonly requestId: string | null,
    readonly retryAfterSec: number | null,
  ) {
    super(message);
  }
}

type CallOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean; // send the partner key (default true)
  grantToken?: string;
  idempotencyKey?: string;
};

const ErrorBody = z.object({
  errors: z.array(z.object({ status: z.string().optional(), code: z.string().optional(), title: z.string().optional(), detail: z.string().optional() })).optional(),
  meta: z.object({ request_id: z.string().optional() }).partial().optional(),
});

async function call<T>(path: string, schema: z.ZodType<T>, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "zorro/0.1" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.auth !== false) {
    const key = process.env.AGENT_API_KEY;
    if (!key) throw new AgentApiError("AGENT_API_KEY is not set", 0, "missing_api_key", null, null, null);
    headers["X-API-Key"] = key;
  }
  if (opts.grantToken) headers["X-Grant-Token"] = opts.grantToken;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(45_000),
  });
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ErrorBody.safeParse(json);
    const first = parsed.success ? parsed.data.errors?.[0] : undefined;
    const retryAfter = res.headers.get("retry-after");
    throw new AgentApiError(
      `Agent API ${path} failed: ${first?.title ?? res.status}`,
      res.status,
      first?.code ?? null,
      first?.detail ?? null,
      parsed.success ? (parsed.data.meta?.request_id ?? null) : null,
      retryAfter ? Number(retryAfter) : null,
    );
  }
  return schema.parse(json);
}

// ---------- Shared shapes ----------

export const OPERATION_STATUSES = [
  "PENDING_SIGNATURE",
  "QUEUED",
  "PENDING_APPROVAL",
  "PENDING_DEPOSIT",
  "PROCESSING",
  "UNCERTAIN", // outcome not proven yet: keep polling, NEVER resend under a new key
  "NEEDS_REVIEW", // automatic settlement stopped
  "SUCCESS",
  "REFUNDED",
  "FAILED",
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];
export const FINAL_STATUSES: OperationStatus[] = ["SUCCESS", "REFUNDED", "FAILED"];

/** Returned by submit-intent, status, deposit, swap, withdraw… */
export const OperationSchema = z
  .object({
    correlation_id: z.string().nullable(),
    agent_id: z.string().nullable(),
    status: z.enum(OPERATION_STATUSES),
    failure_code: z.string().nullable(),
    type: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();
export type Operation = z.infer<typeof OperationSchema>;

export type Owner =
  | { type: "passkey"; credential_id: string; public_key: string; rp_id: string; origin: string }
  | { type: "near"; account_id: string; public_key: string };

/** The owner-signed rules. Shape per the spec; tightened in Phase 4 when we build the policy screen. */
export type AgentPolicy = {
  frozen: boolean;
  actions: ("swap" | "transfer" | "withdraw" | "limit_order")[];
  confidential: boolean;
  owner_approval: boolean;
  assets: unknown;
  limits: Record<string, unknown>;
  max_actions_per_hour: number | null;
  destinations: { mode: "any" | "only" | "except"; list: unknown[] };
  budget: { daily_usd: string | null; weekly_usd: string | null; monthly_usd: string | null };
  timelock_ms: number;
  limit_order?: { max_deviation_bps: number };
};

// ---------- Public & account ----------

const NetworkSchema = z
  .object({
    network: z.string(),
    contract_id: z.string(),
    supported_owner_types: z.array(z.string()),
    status: z.object({ overall: z.string() }).loose(),
  })
  .loose();

export const network = () => call("/v1/network", NetworkSchema, { auth: false });

const TokenSchema = z
  .object({ asset_id: z.string(), symbol: z.string(), decimals: z.number(), blockchain: z.string(), price: z.number().nullable() })
  .loose();
export const tokens = () =>
  call("/v1/tokens", z.object({ data: z.array(TokenSchema) }), { auth: false }).then((r) => r.data);

export const whoami = () => call("/v1/whoami", z.object({ api_key_id: z.string(), tenant_id: z.string() }).loose());

export const quotas = () =>
  call(
    "/v1/quotas",
    z
      .object({
        limits: z.record(z.string(), z.number()),
        usage: z.record(z.string(), z.number()),
      })
      .loose(),
  );

// ---------- Owner intents (signed by the user's passkey) ----------

const GeneratedIntentSchema = z
  .object({
    correlation_id: z.string(),
    type: z.string(),
    agent_id: z.string(),
    status: z.string(),
    expires_at: z.string(),
    intent: z.object({ standard: z.string(), payload: z.record(z.string(), z.unknown()) }).loose(),
    preview: z.object({ summary: z.string() }).loose(),
  })
  .loose();
export type GeneratedIntent = z.infer<typeof GeneratedIntentSchema>;

export const generateIntent = (body: Record<string, unknown> & { type: string }, idempotencyKey: string) =>
  call("/v1/generate-intent", GeneratedIntentSchema, { body, idempotencyKey });

export const submitIntent = (body: { type: string; correlation_id: string; signed_data: Record<string, unknown> }) =>
  call("/v1/submit-intent", OperationSchema, { body });

/** Settlement status. waitMs (≤ 30000) long-polls until the status changes. */
export const intentStatus = (correlationId: string, waitMs?: number) =>
  call(
    `/v1/status?correlation_id=${encodeURIComponent(correlationId)}${waitMs ? `&wait_ms=${waitMs}` : ""}`,
    OperationSchema,
  );

// ---------- Agents ----------

const AgentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["PENDING", "ACTIVE", "ARCHIVED", "DELETED", "ABANDONED"]),
    wallet: z.object({ wallet_id: z.string(), near_account_id: z.string() }).loose().nullable(),
    created_at: z.string(),
  })
  .loose();

export const getAgent = (agentId: string) => call(`/v1/agents/${encodeURIComponent(agentId)}`, AgentSchema);

const BalanceSchema = z
  .object({
    asset_id: z.string().optional(),
    symbol: z.string().nullish(),
    balance: z.string().nullish(), // exact decimal for display (null when decimals unknown)
    balance_raw: z.string(), // exact atomic amount for arithmetic
  })
  .loose();
export type AgentBalance = z.infer<typeof BalanceSchema>;

export const getBalances = (agentId: string, source: "confidential" | "public" = "confidential") =>
  call(
    `/v1/agents/${encodeURIComponent(agentId)}/balances?source=${source}`,
    z.object({ near_account_id: z.string(), source: z.string(), balances: z.array(BalanceSchema) }).loose(),
  );

const BudgetWindow = z
  .object({ limit_usd: z.string().nullable(), spent_usd: z.string().nullable(), remaining_usd: z.string().nullable(), resets_at: z.string().nullable() })
  .loose();

export const getPolicy = (agentId: string) =>
  call(
    `/v1/agents/${encodeURIComponent(agentId)}/policy`,
    z
      .object({
        revision: z.number().optional(),
        status: z.string().optional(),
        usage: z.object({ budget: z.object({ daily: BudgetWindow }).loose() }).loose().optional(),
      })
      .loose(),
  );

// ---------- Money actions (grant token + idempotency key) ----------

type GrantCall = { grantToken: string; idempotencyKey: string };

/** Funding address for the agent on another chain (API key only, no grant needed). */
export const requestDeposit = (
  agentId: string,
  body: { origin_asset: string; destination_asset?: string; amount?: string; note?: string },
  idempotencyKey: string,
) => call(`/v1/agents/${encodeURIComponent(agentId)}/deposit`, OperationSchema, { body, idempotencyKey });

/** Dry-run answer for swap, limit order and withdraw: runs nothing, charges nothing. */
const DryRunSchema = z
  .object({
    dry: z.literal(true),
    type: z.string(),
    quote: z
      .object({
        amount_in: z.string().optional(),
        amount_out: z.string().optional(),
        min_amount_out: z.string().optional(),
        time_estimate_seconds: z.number().optional(),
      })
      .loose(),
    spend: z.object({ amount_usd: z.string().nullable() }).loose(),
    fee: z.object({ amount_usd: z.string(), percent: z.string() }).loose().nullable(),
    owner_approval: z.boolean(),
    // Each warning is a refusal the live request would get (e.g. insufficient_balance).
    warnings: z.array(z.object({ code: z.string(), detail: z.string().optional() }).loose()),
  })
  .loose();
export type DryRun = z.infer<typeof DryRunSchema>;

export type SwapBody = { origin_asset: string; destination_asset: string; amount: string; min_amount_out?: string; note?: string };

/** Swap quote: needs only the partner key; a grant is optional (sent to prove it works). */
export const quoteAgentSwap = (agentId: string, body: SwapBody, grantToken?: string) =>
  call(`/v1/agents/${encodeURIComponent(agentId)}/swap`, DryRunSchema, { body: { ...body, dry: true }, grantToken });

export const agentSwap = (agentId: string, body: SwapBody, g: GrantCall) =>
  call(`/v1/agents/${encodeURIComponent(agentId)}/swap`, OperationSchema, { body: { ...body, dry: false }, ...g });

export type LimitOrderBody = {
  base_asset: string;
  quote_asset: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  deadline?: string;
  note?: string;
};

export const placeLimitOrder = (agentId: string, body: LimitOrderBody, g: GrantCall) =>
  call(`/v1/agents/${encodeURIComponent(agentId)}/limit-orders`, OperationSchema, { body, ...g });

export const cancelLimitOrder = (agentId: string, orderId: string, grantToken: string) =>
  call(
    `/v1/agents/${encodeURIComponent(agentId)}/limit-orders/${encodeURIComponent(orderId)}/cancel`,
    z.record(z.string(), z.unknown()),
    { method: "POST", body: {}, grantToken },
  );

export type WithdrawBody = { asset: string; amount: string; chain: string; recipient: string; memo?: string; note?: string };

export const withdraw = (agentId: string, body: WithdrawBody, g: GrantCall) =>
  call(`/v1/agents/${encodeURIComponent(agentId)}/withdraw`, OperationSchema, { body, ...g });

/** Withdrawal preview: needs the grant and an Idempotency-Key, like the real withdrawal. */
export const previewWithdraw = (agentId: string, body: WithdrawBody, g: GrantCall) =>
  call(`/v1/agents/${encodeURIComponent(agentId)}/withdraw`, DryRunSchema, { body: { ...body, dry: true }, ...g });

/** Status of any operation (op_…) or owner intent (intent_…). */
export const operationStatus = intentStatus;
