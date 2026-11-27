// AI assistant: plain English → a drafted payment or Autopay. Server-side only.
// The AI never pays. It only fills in a draft that the user reviews on the normal Pay or
// Autopay screen. It sees the typed request and the names of the user's approved payees,
// never addresses, balances, keys or tokens (aiJson() refuses anything that looks like one).

import { z } from "zod";
import { AiError, aiJson } from "./ai";
import { coin } from "./coins";
import { listPayees } from "./payees";
import type { CurrentUser } from "./session";

// ---------- Rate limit (per user, in memory) ----------

const WINDOW_MS = 10 * 60_000;
const MAX_CALLS = 15;
const calls = new Map<string, number[]>();

export function checkAiRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) throw new AiError("You've used the assistant a lot in the last few minutes. Try again shortly.");
  recent.push(now);
  calls.set(userId, recent);
}

// ---------- Draft ----------

const AnswerSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    action: z.enum(["pay", "autopay"]),
    payee: z.string().min(1).max(60),
    amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
    currency: z.enum(["INR", "USD", "COIN"]),
    frequency: z.enum(["weekly", "monthly"]).nullish(),
    day: z.number().int().nullish(),
    note: z.string().max(120).nullish(),
    explanation: z.string().max(300),
  }),
  z.object({ status: z.literal("clarify"), question: z.string().max(300) }),
  z.object({ status: z.literal("unsupported"), reason: z.string().max(300) }),
]);

export type PaymentDraft =
  | {
      status: "ok";
      action: "pay" | "autopay";
      payeeId: string;
      payeeName: string;
      coinKey: string;
      amount: string;
      currency: "INR" | "USD" | "COIN";
      frequency: "weekly" | "monthly" | null;
      day: number | null;
      note: string | null;
      explanation: string;
    }
  | { status: "clarify"; question: string }
  | { status: "unsupported"; reason: string };

export async function draftFromText(user: CurrentUser, text: string): Promise<PaymentDraft> {
  const request = text.trim();
  if (request.length < 4) throw new AiError("Say a little more, e.g. “Pay Riya ₹500 in USDC every Friday”.");
  if (request.length > 400) throw new AiError("Please keep it under 400 characters.");

  const payees = (await listPayees(user)).filter((p) => p.status === "approved");
  if (payees.length === 0) return { status: "clarify", question: "You have no approved payees yet. Add the person in Payees first, then ask me again." };

  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const list = payees.map((p) => `- ${p.name} (receives ${coin(p.coinKey).symbol} on ${coin(p.coinKey).chainName})`).join("\n");
  const system = `You draft payments inside Zorro, a ZEC wallet that pays people in the coin they want. Today is ${today} (India).
The user's approved payees are:
${list}

Turn the request into ONE draft:
- "pay" = a single payment now. "autopay" = repeating: frequency "weekly" (day 0=Sunday … 6=Saturday) or "monthly" (day 1-28; use 28 for "end of month").
- "payee" must be EXACTLY one name from the list. If the person isn't in the list, or it's ambiguous, answer "clarify".
- "currency": "INR" for rupees/₹, "USD" for dollars/$, "COIN" when the amount is in the payee's coin (e.g. "20 USDC", "0.1 ZEC"). "amount" is a plain number as a string.
- If the amount is missing, answer "clarify". Never guess amounts.
- Answer "unsupported" for anything that isn't paying an approved payee (trading, loans, predictions, other people's money).
- "explanation": one short sentence restating the draft in plain words.

Reply with ONE JSON object:
{"status":"ok","action":"pay|autopay","payee":"…","amount":"…","currency":"INR|USD|COIN","frequency":null,"day":null,"note":null,"explanation":"…"}
{"status":"clarify","question":"…"}
{"status":"unsupported","reason":"…"}`;

  const { data } = await aiJson({ system, user: request, schema: AnswerSchema, maxTokens: 300, temperature: 0.1 });
  if (data.status !== "ok") return data;

  const payee = payees.find((p) => p.name.toLowerCase() === data.payee.trim().toLowerCase());
  if (!payee) return { status: "clarify", question: `I couldn't find “${data.payee}” in your payees. Who did you mean?` };
  if (!/^\d+(\.\d+)?$/.test(data.amount) || Number(data.amount) <= 0) return { status: "clarify", question: "How much should I pay?" };

  let frequency: "weekly" | "monthly" | null = null;
  let day: number | null = null;
  if (data.action === "autopay") {
    frequency = data.frequency ?? "monthly";
    day = data.day ?? (frequency === "weekly" ? 1 : 1);
    if (frequency === "weekly" && (day < 0 || day > 6)) day = 1;
    if (frequency === "monthly" && (day < 1 || day > 28)) day = Math.min(28, Math.max(1, day));
  }
  return {
    status: "ok",
    action: data.action,
    payeeId: payee.id,
    payeeName: payee.name,
    coinKey: payee.coinKey,
    amount: data.amount,
    currency: data.currency,
    frequency,
    day,
    note: data.note ?? null,
    explanation: data.explanation,
  };
}
