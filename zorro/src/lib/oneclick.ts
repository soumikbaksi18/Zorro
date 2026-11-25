// Minimal typed client for the NEAR Intents 1Click API.
// Server-side only: the API key must never reach the browser.
// Spec: https://1click.chaindefuser.com/docs/v0/openapi.yaml

import { z } from "zod";

const BASE_URL = process.env.ONECLICK_BASE_URL ?? "https://1click.chaindefuser.com";

function authHeaders(): Record<string, string> {
  const key = process.env.ONECLICK_API_KEY;
  return key ? { "X-API-Key": key } : {};
}

export class OneClickError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...authHeaders(), ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new OneClickError(`1Click ${path} failed with ${res.status}`, res.status, body);
  }
  return schema.parse(body);
}

// ---------- Tokens ----------

const TokenSchema = z.object({
  assetId: z.string(),
  decimals: z.number(),
  blockchain: z.string(),
  symbol: z.string(),
  price: z.number(),
  priceUpdatedAt: z.string(),
  contractAddress: z.string().optional(),
});
export type OneClickToken = z.infer<typeof TokenSchema>;

export function getTokens(): Promise<OneClickToken[]> {
  return request("/v0/tokens", z.array(TokenSchema));
}

// ---------- Quotes ----------

export type QuoteRequest = {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT";
  slippageTolerance: number; // basis points, 100 = 1%
  originAsset: string;
  destinationAsset: string;
  amount: string; // base units
  depositType: "ORIGIN_CHAIN";
  refundTo: string;
  refundType: "ORIGIN_CHAIN";
  recipient: string;
  recipientType: "DESTINATION_CHAIN";
  deadline: string; // ISO timestamp
};

const QuoteResponseSchema = z.object({
  quote: z.object({
    amountIn: z.string(),
    amountInFormatted: z.string(),
    amountInUsd: z.string().optional(),
    minAmountIn: z.string().optional(),
    amountOut: z.string(),
    amountOutFormatted: z.string(),
    amountOutUsd: z.string().optional(),
    minAmountOut: z.string(),
    timeEstimate: z.number(),
    depositAddress: z.string().optional(), // absent on dry quotes
    deadline: z.string().optional(),
    timeWhenInactive: z.string().optional(),
  }),
  signature: z.string(),
  timestamp: z.string(),
  correlationId: z.string().optional(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export function getQuote(body: QuoteRequest): Promise<QuoteResponse> {
  return request("/v0/quote", QuoteResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---------- Swap status ----------

export const SWAP_STATUSES = [
  "PENDING_DEPOSIT",
  "KNOWN_DEPOSIT_TX",
  "INCOMPLETE_DEPOSIT",
  "PROCESSING",
  "SUCCESS",
  "REFUNDED",
  "FAILED",
] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

const TxSchema = z.object({ hash: z.string(), explorerUrl: z.string().optional() });

const StatusResponseSchema = z.object({
  status: z.enum(SWAP_STATUSES),
  updatedAt: z.string(),
  swapDetails: z
    .object({
      depositedAmountFormatted: z.string().nullish(),
      amountInFormatted: z.string().nullish(),
      amountOutFormatted: z.string().nullish(),
      refundedAmountFormatted: z.string().nullish(),
      refundReason: z.string().nullish(),
      originChainTxHashes: z.array(TxSchema).nullish(),
      destinationChainTxHashes: z.array(TxSchema).nullish(),
    })
    .partial()
    .nullish(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;

export function getStatus(depositAddress: string): Promise<StatusResponse> {
  return request(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, StatusResponseSchema);
}
