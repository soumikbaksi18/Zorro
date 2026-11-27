// "Swap now": turns a user's swap request into a NEAR Intents quote.
// Server-side only (uses the 1Click client).

import { z } from "zod";
import { ZEC, fromBaseUnits, getStablecoin, toBaseUnits, type StablecoinKey } from "./assets";
import { isValidAddressForChain } from "./addresses";
import { OneClickError, getQuote, getStatus, type QuoteRequest, type StatusResponse } from "./oneclick";
import { buildPaymentLink, type PaymentLink } from "./payment-links";

export const SwapInputSchema = z.object({
  /** sell = ZEC → USDC, buy = USDC → ZEC */
  direction: z.enum(["sell", "buy"]),
  stable: z.enum(["usdc-base", "usdc-sol"]),
  /** Human amount of what the user sends (ZEC when selling, USDC when buying). */
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter a number"),
  /** Where the user receives the output. */
  recipient: z.string().trim().min(1),
  /** Where NEAR Intents returns the deposit if the swap can't complete. */
  refundTo: z.string().trim().min(1),
  slippageBps: z.number().int().min(10).max(500),
  dry: z.boolean(),
});
export type SwapInput = z.infer<typeof SwapInputSchema>;

type Side = { key: string; symbol: string; chainName: string; amount: string; usd: string | null };

export type SwapQuote = {
  direction: SwapInput["direction"];
  stable: StablecoinKey;
  send: Side; // what the user deposits
  receive: Side & { minAmount: string }; // what they get (estimate and guaranteed minimum)
  timeEstimateSec: number;
  // Only on live (non-dry) quotes:
  depositAddress?: string;
  deadline?: string;
  payment?: PaymentLink;
};

export class SwapError extends Error {}

export async function quoteSwap(input: SwapInput): Promise<SwapQuote> {
  const coin = getStablecoin(input.stable)!;
  const selling = input.direction === "sell";
  const origin = selling ? ZEC : coin;
  const destination = selling ? coin : ZEC;

  if (!isValidAddressForChain(destination.chain, input.recipient)) {
    throw new SwapError(`That doesn't look like a ${destination.chainName} address for receiving ${destination.symbol}.`);
  }
  if (!isValidAddressForChain(origin.chain, input.refundTo)) {
    throw new SwapError(`The refund address must be a ${origin.chainName} address.`);
  }

  let amount: string;
  try {
    amount = toBaseUnits(input.amount, origin.decimals);
  } catch (e) {
    throw new SwapError((e as Error).message);
  }
  if (BigInt(amount) === BigInt(0)) throw new SwapError("Enter an amount above zero.");

  const request: QuoteRequest = {
    dry: input.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageBps,
    originAsset: origin.assetId,
    destinationAsset: destination.assetId,
    amount,
    depositType: "ORIGIN_CHAIN",
    refundTo: input.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: input.recipient,
    recipientType: "DESTINATION_CHAIN",
    // NEAR Intents extends short deadlines (observed: +3 days), so this is a floor.
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  };

  let res;
  try {
    res = await getQuote(request);
  } catch (e) {
    throw new SwapError(friendlyQuoteError(e, origin.decimals, origin.symbol));
  }

  const q = res.quote;
  const quote: SwapQuote = {
    direction: input.direction,
    stable: input.stable,
    send: { key: origin.key, symbol: origin.symbol, chainName: origin.chainName, amount: q.amountInFormatted, usd: q.amountInUsd ?? null },
    receive: {
      key: destination.key,
      symbol: destination.symbol,
      chainName: destination.chainName,
      amount: q.amountOutFormatted,
      usd: q.amountOutUsd ?? null,
      minAmount: fromBaseUnits(q.minAmountOut, destination.decimals),
    },
    timeEstimateSec: q.timeEstimate,
  };

  if (!input.dry) {
    if (!q.depositAddress) throw new SwapError("NEAR Intents didn't return a deposit address. Please try again.");
    quote.depositAddress = q.depositAddress;
    quote.deadline = q.deadline;
    quote.payment = buildPaymentLink(origin.key, q.depositAddress, q.amountIn);
  }
  return quote;
}

/** Turn 1Click errors into something a person can act on. */
function friendlyQuoteError(e: unknown, decimals: number, symbol: string): string {
  if (!(e instanceof OneClickError)) return "Couldn't reach NEAR Intents. Check your connection and try again.";
  const message = (e.body as { message?: string } | null)?.message ?? "";

  const tooLow = message.match(/try at least (\d+)/);
  if (tooLow) return `Amount too low. The minimum is ${fromBaseUnits(tooLow[1], decimals)} ${symbol}.`;
  if (/recipient is not valid/i.test(message)) return "NEAR Intents rejected the receiving address. Please check it.";
  if (/refundTo is not valid/i.test(message)) return "NEAR Intents rejected the refund address. Please check it.";
  if (e.status === 429) return "Too many requests. Wait a moment and try again.";
  if (e.status === 401) return "NEAR Intents needs an API key for this request.";
  return message || "NEAR Intents couldn't quote this swap. Try a different amount.";
}

export type SwapStatusView = {
  status: StatusResponse["status"];
  updatedAt: string;
  receivedAmount: string | null;
  refundedAmount: string | null;
  refundReason: string | null;
  destinationTx: { hash: string; url?: string } | null;
};

export async function swapStatus(depositAddress: string): Promise<SwapStatusView> {
  const s = await getStatus(depositAddress);
  const d = s.swapDetails ?? {};
  const tx = d.destinationChainTxHashes?.[0];
  const refunded = d.refundedAmountFormatted;
  return {
    status: s.status,
    updatedAt: s.updatedAt,
    receivedAmount: d.amountOutFormatted ?? null,
    refundedAmount: refunded && refunded !== "0" ? refunded : null,
    refundReason: d.refundReason ?? null,
    destinationTx: tx ? { hash: tx.hash, url: tx.explorerUrl } : null,
  };
}
