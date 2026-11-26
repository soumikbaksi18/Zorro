// AI assistant: plain English → a validated bot config, and plain-English backtest explanations.
// Server-side only. The AI never trades and never sees addresses, balances, keys or tokens:
// it only drafts settings, which pass the same validation as the form and start as paper bots.

import { z } from "zod";
import { AiError, aiJson } from "./ai";
import { MIN_LIMIT_ZEC, MIN_ZEC_TRADE, BotConfigSchema, describeBot, type BotConfig } from "./bots/config";
import type { BacktestResult } from "./bots/backtest";

// ---------- Rate limit (per user, in memory) ----------

const WINDOW_MS = 10 * 60_000;
const MAX_CALLS = 12;
const calls = new Map<string, number[]>();

export function checkAiRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) throw new AiError("You've used the AI assistant a lot in the last few minutes. Try again shortly.");
  recent.push(now);
  calls.set(userId, recent);
}

// ---------- Strategy from text ----------

const AnswerSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    bot: z.record(z.string(), z.unknown()),
    name: z.string().max(60).optional(),
    explanation: z.string().max(700),
    assumptions: z.array(z.string().max(240)).max(6).default([]),
  }),
  z.object({ status: z.literal("clarify"), question: z.string().max(300) }),
  z.object({ status: z.literal("unsupported"), reason: z.string().max(300) }),
]);

export type StrategyAnswer =
  | { status: "ok"; config: BotConfig; name: string | null; description: string; explanation: string; assumptions: string[] }
  | { status: "clarify"; question: string }
  | { status: "unsupported"; reason: string };

function systemPrompt(priceUsd: number, today: string): string {
  return `You are the strategy assistant inside Zorro, an app that runs ZEC (Zcash) trading bots through NEAR Intents.
Today is ${today}. ZEC is $${priceUsd.toFixed(2)} right now. Stablecoins: "usdc-base" (USDC on Base) or "usdc-sol" (USDC on Solana).

Turn the user's request into exactly ONE bot using one of these five kinds. Use exactly these field names and types:

1. Stop-loss: sell a fixed ZEC amount if the price falls to a level.
   {"kind":"stop_loss","mode":"paper","amountZec":"0.5","triggerPriceUsd":600,"sellTo":"usdc-base","slippageBps":100}
2. Trailing stop: sell if the price drops trailPct % from its highest point since the bot started.
   {"kind":"trailing_stop","mode":"paper","amountZec":"0.5","trailPct":10,"sellTo":"usdc-base","slippageBps":100}
3. Smart DCA: buy buyUsd of ZEC every everyHours hours (24 daily, 168 weekly, 720 monthly); buy dipBoostPct % more when the price is dipThresholdPct % below the average cost.
   {"kind":"smart_dca","mode":"paper","buyUsd":20,"everyHours":168,"payWith":"usdc-base","dipBoostPct":50,"dipThresholdPct":10,"maxBuys":null,"slippageBps":100}
4. Take-profit ladder: sell amountZec split evenly over rungs (1-6), the first at firstPriceUsd and each next one stepPct % higher.
   {"kind":"tp_ladder","mode":"paper","amountZec":"0.1","firstPriceUsd":800,"stepPct":10,"rungs":4,"receive":"usdc-base"}
5. Grid: between lowerUsd and upperUsd (upper at least 2% above lower), levels 3-10, trading orderZec per level: buy low, sell one level higher.
   {"kind":"grid","mode":"paper","lowerUsd":650,"upperUsd":850,"levels":5,"orderZec":"0.01","quote":"usdc-base"}

Rules:
- "mode" is always "paper". amountZec and orderZec are decimal STRINGS with at most 8 decimals; all other numbers are numbers.
- Minimums: ${MIN_ZEC_TRADE} ZEC for stop-loss / trailing stop, ${MIN_LIMIT_ZEC} ZEC per ladder rung or grid level, $1 per DCA buy. slippageBps 10-300 (default 100).
- Convert relative instructions using today's price: e.g. "if it drops 10%" → triggerPriceUsd = 90% of today's price for a stop-loss.
- You do NOT know the user's balance. If they refer to a share of their holdings ("half my ZEC", "all of it"), ask how much ZEC that is.
- If an amount is simply missing, pick a small default (0.01 ZEC, or $10 for DCA) and say so in "assumptions".
- If the request needs something these bots cannot do (leverage, shorting, other coins, predicting prices, guaranteed profit), answer "unsupported".
- Never promise profits. Keep "explanation" to 2-3 plain sentences a beginner understands.

Answer with ONE JSON object in one of these shapes:
{"status":"ok","bot":{...},"name":"short name (max 40 chars)","explanation":"...","assumptions":["..."]}
{"status":"clarify","question":"one short question"}
{"status":"unsupported","reason":"one short sentence, and suggest the closest bot Zorro can run"}`;
}

export async function strategyFromText(text: string, priceUsd: number): Promise<StrategyAnswer> {
  const request = text.trim();
  if (request.length < 4) throw new AiError("Describe the strategy in a few more words.");
  if (request.length > 600) throw new AiError("Please keep it under 600 characters.");

  const today = new Date().toISOString().slice(0, 10);
  const system = systemPrompt(priceUsd, today);
  let user = request;

  // One repair round: if the bot fails validation, show the model the exact problems once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await aiJson({ system, user, schema: AnswerSchema, maxTokens: 700, temperature: 0.1 });
    if (data.status !== "ok") return data;

    const parsed = BotConfigSchema.safeParse({ ...data.bot, mode: "paper" }); // always paper: the user decides on live
    if (parsed.success) {
      return {
        status: "ok",
        config: parsed.data,
        name: data.name?.slice(0, 40) ?? null,
        description: describeBot(parsed.data),
        explanation: data.explanation,
        assumptions: data.assumptions,
      };
    }
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "bot"}: ${i.message}`).join("; ");
    user = `${request}\n\nYour previous bot was invalid (${problems}). Previous bot: ${JSON.stringify(data.bot)}. Return a corrected answer.`;
  }
  throw new AiError("The assistant couldn't turn that into a valid bot. Try rephrasing, or use the form.");
}

// ---------- Explain a backtest ----------

const ExplainSchema = z.object({ explanation: z.string().max(900) });

export async function explainBacktest(config: BotConfig, result: Pick<BacktestResult, "summary" | "stats" | "startValueUsd" | "endValueUsd" | "holdValueUsd" | "feesUsd">): Promise<string> {
  const facts = [
    `Bot: ${describeBot(config)}.`,
    `Result: ${result.summary}`,
    ...result.stats.map((s) => `${s.label}: ${s.value}`),
    `Fees paid in the simulation: $${result.feesUsd.toFixed(2)}.`,
  ].join("\n");
  const { data } = await aiJson({
    system:
      "You explain trading-bot backtests to beginners in 3 short sentences: what happened, why (which market move drove it), and one thing to consider before running it live. Use only the facts given; never invent numbers; never promise future results. Reply as JSON: {\"explanation\":\"...\"}",
    user: facts,
    schema: ExplainSchema,
    maxTokens: 300,
    temperature: 0.2,
  });
  return data.explanation;
}
