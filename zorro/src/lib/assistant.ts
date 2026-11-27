// "Ask Zorro": the chat + voice assistant. Server-side only.
//
// It answers questions about ZEC and Zorro, and about the user's own wallet from a context
// Zorro builds (balances, payee names, Autopays, recent payments, live price and news).
// It never sees addresses, keys or tokens (the data guard refuses them), and it never moves
// money: it returns actions (charts, drafts, screens) that the user reviews and confirms.

import { z } from "zod";
import { AiError, aiConfigured, aiJson, assertNoSensitiveData } from "./ai";
import { activeAgentFor } from "./agent-service";
import { COINS, COIN_KEYS, coin, findCoin } from "./coins";
import { CHART_ASSETS, CHART_RANGES } from "./history";
import { getLatestNews, newsConfigured } from "./news";
import { listPayees } from "./payees";
import { listPayments } from "./payments";
import { getRates } from "./rates";
import { chat, sarvamConfigured } from "./sarvam";
import { amountLabel, describeSchedule } from "./schedule-format";
import { listSchedules } from "./schedules";
import type { CurrentUser } from "./session";
import { balancesFor, type WalletBalances } from "./wallet-service";

// ---------- Rate limit (per user, in memory) ----------

const calls = new Map<string, number[]>();
export function checkAssistantRateLimit(userId: string, max = 30): void {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= max) throw new AiError("You've asked a lot in the last few minutes. Try again shortly.");
  recent.push(now);
  calls.set(userId, recent);
}

// ---------- Actions ----------

const SCREENS = {
  pay: { href: "/pay", label: "Open Pay" },
  payees: { href: "/payees", label: "Open Payees" },
  autopay: { href: "/autopay", label: "Open Autopay" },
  request: { href: "/request", label: "Request money" },
  scan: { href: "/scan", label: "Scan to pay" },
  tracker: { href: "/tracker", label: "Open Tracker" },
  receive: { href: "/wallet/receive", label: "Add money" },
  swap: { href: "/wallet/swap", label: "Open Swap" },
  news: { href: "/news", label: "Zcash news" },
  account: { href: "/account", label: "Open Account" },
  setup: { href: "/wallet/setup", label: "Create your wallet" },
} as const;

const RawAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chart"), asset: z.enum(CHART_ASSETS), range: z.enum(CHART_RANGES).default("7d") }),
  z.object({ type: z.literal("balances") }),
  z.object({ type: z.literal("news") }),
  z.object({ type: z.literal("open"), screen: z.enum(Object.keys(SCREENS) as [keyof typeof SCREENS, ...(keyof typeof SCREENS)[]]) }),
  z.object({ type: z.literal("pay"), payee: z.string().min(1), amount: z.union([z.string(), z.number()]).transform(String), currency: z.enum(["INR", "USD", "COIN"]) }),
  z.object({
    type: z.literal("autopay"),
    payee: z.string().min(1),
    amount: z.union([z.string(), z.number()]).transform(String),
    currency: z.enum(["INR", "USD", "COIN"]),
    frequency: z.enum(["weekly", "monthly"]),
    day: z.number().int(),
  }),
  z.object({ type: z.literal("swap"), from: z.enum(COIN_KEYS), to: z.enum(COIN_KEYS), amount: z.union([z.string(), z.number()]).transform(String) }),
]);

const ModelAnswer = z.object({
  reply: z.string().min(1).max(4000),
  language: z.string().max(12).optional(),
  actions: z.array(z.unknown()).max(5).default([]),
});

export type AssistantAction =
  | { type: "chart"; asset: (typeof CHART_ASSETS)[number]; range: (typeof CHART_RANGES)[number] }
  | { type: "balances"; balances: WalletBalances }
  | { type: "draft"; kind: "pay" | "autopay" | "swap"; title: string; detail: string; href: string; coinKey: string }
  | { type: "open"; label: string; href: string }
  | { type: "news"; items: { title: string; source: string; link: string; publishedAt: string }[] };

export type AssistantReply = { reply: string; language: string; actions: AssistantAction[] };

export type ChatTurn = { role: "user" | "assistant"; content: string };

// ---------- What the assistant knows ----------

const APP_GUIDE = `ABOUT ZORRO (the app you live in)
- Zorro is a phone-first private payments wallet for Zcash (ZEC), on NEAR Intents, with amounts shown in INR or USD. Users hold ZEC and pay anyone in the coin they want; Zorro converts at the moment of paying.
- Wallet: created with one passkey (Face ID / fingerprint), no seed phrase. It is a NEAR Intents account with a confidential (private) balance that can hold 13 coins on 8 chains: ZEC, USDC (Base, Solana, Ethereum, Arbitrum), USDT (Tron, Ethereum, Solana), SOL, ETH (Ethereum, Base), BTC, NEAR.
- Safety: Zorro's server holds a payment permission. With it, Zorro can pay ONLY payees the user approved with their passkey, and only up to the daily USD limit they signed, without asking again (that's how Autopay works). It can't add payees, raise the limit or send anywhere else without the user's passkey; NEAR Intents enforces this. So a hacked server could at worst pay approved payees up to the daily limit. Adding payees: Payees screen, then "Approve with Face ID" (one signature approves all waiting payees; NEAR Intents allows one rules change every 10 minutes).
- Pay: choose a payee, type an amount in INR, USD or their coin, see what it costs in ZEC with fees, slide to pay. About 0.6% conversion fee plus a network fee. Zorro-to-Zorro payments to an @handle are instant, private, with no network fee.
- Swap: convert inside the wallet (e.g. ZEC to USDC, SOL, ETH) with 1% max slippage; it stays in the wallet.
- Autopay: weekly or monthly payments at 9:00 AM IST, converted from ZEC on the day; skipped runs show in the Tracker.
- Request money: a payment link anyone can pay in any of the 13 coins; it arrives as ZEC.
- Scan to pay: camera or paste; understands Zcash (ZIP-321), Ethereum/Base/Arbitrum (EIP-681), Solana Pay, Bitcoin (BIP-21) and plain addresses. New addresses need one Face ID approval.
- Add money: one-time deposit address for any coin. ZEC arrives through a transparent (t1) address.
- Tracker: monthly spend, today's limit, 7-day chart, receipts, CSV export. News: Zcash-only headlines with an AI brief.
- Privacy, honestly: balances and history are private from the public (not on a block explorer); Zorro-to-Zorro payments never touch a public chain; payees only see what they received. But NEAR Intents and Zorro's server see payments to run them, and ZEC enters/leaves via transparent addresses, so long-term savings are best kept shielded in a Zcash wallet (Zashi, Vizor). The Agent API is an experimental beta: small amounts only.

ABOUT ZCASH (general knowledge you may use)
- Zcash (ZEC) launched in 2016 as a privacy-focused cryptocurrency using zero-knowledge proofs (zk-SNARKs; Halo 2 removed the trusted setup). Shielded addresses (Sapling zs…, unified u1… with Orchard) hide sender, receiver and amount; transparent t-addresses work like Bitcoin. Max supply 21 million ZEC; blocks about every 75 seconds; halvings roughly every 4 years (the latest in Nov 2024). Wallets include Zashi and Vizor.`;

async function buildContext(user: CurrentUser): Promise<{ text: string; balances: WalletBalances | null }> {
  const lines: string[] = [];
  const now = new Date(Date.now() + 330 * 60_000);
  lines.push(`Today (India): ${now.toUTCString().slice(0, 22)} IST. The user's handle: ${user.handle ? `@${user.handle}` : "not set"}.`);

  const rates = await getRates().catch(() => null);
  if (rates) lines.push(`ZEC price now: $${rates.zecUsd.toFixed(2)} (₹${(rates.zecUsd * rates.usdInr).toFixed(0)}). 1 USD = ₹${rates.usdInr.toFixed(2)}.`);

  const agent = await activeAgentFor(user.id);
  let balances: WalletBalances | null = null;
  if (!agent || agent.status !== "ACTIVE") {
    lines.push("The user has no Zorro wallet yet (they can create one in setup).");
  } else {
    const [b, payees, schedules, payments] = await Promise.all([
      balancesFor(user).catch(() => null),
      listPayees(user).catch(() => []),
      listSchedules(user).catch(() => []),
      listPayments(user, { limit: 8 }).catch(() => []),
    ]);
    balances = b;
    if (b) {
      lines.push(`Wallet balances (total ≈ $${b.totalUsd.toFixed(2)} / ₹${b.totalInr.toFixed(0)}): ${b.coins.map((c) => `${c.amount} ${c.symbol}${c.chainName !== c.symbol && c.symbol !== "ZEC" ? ` on ${c.chainName}` : ""} (≈ $${(c.usd ?? 0).toFixed(2)})`).join("; ")}.`);
      if (b.limit?.limitUsd) lines.push(`Daily limit: $${b.limit.limitUsd}, used today $${Number(b.limit.spentUsd ?? 0).toFixed(2)}.`);
    }
    const approved = payees.filter((p) => p.status === "approved");
    const waiting = payees.filter((p) => p.status !== "approved");
    lines.push(`Approved payees: ${approved.length ? approved.map((p) => `"${p.name}" (receives ${coin(p.coinKey).symbol} on ${coin(p.coinKey).chainName})`).join(", ") : "none"}.`);
    if (waiting.length) lines.push(`Payees waiting for Face ID approval: ${waiting.map((p) => `"${p.name}"`).join(", ")}.`);
    if (schedules.length) {
      lines.push(`Autopays: ${schedules.map((s) => `${s.payee.name}: ${amountLabel(s.amount, s.currency, s.payee.coinKey)} ${describeSchedule(s).toLowerCase()} (${s.status}, next ${s.nextRunAt.slice(0, 10)})`).join("; ")}.`);
    }
    if (payments.length) {
      lines.push(
        `Recent activity: ${payments
          .map((p) => `${p.createdAt.slice(0, 10)} ${p.kind === "swap" ? "swapped" : p.direction === "out" ? "paid" : "received"} ${p.counterparty}: ${p.amount} ${coin(p.coinKey).symbol}${p.inr ? ` (₹${p.inr.toFixed(0)})` : ""} [${p.status}]`)
          .join("; ")}.`,
      );
    }
  }

  if (newsConfigured()) {
    const news = await getLatestNews().catch(() => null);
    if (news?.articles.length) lines.push(`Latest Zcash headlines: ${news.articles.slice(0, 5).map((a) => `"${a.title}" (${a.source.name}, ${a.publishedAt.slice(0, 10)})`).join("; ")}.`);
  }
  return { text: lines.join("\n"), balances };
}

function systemPrompt(context: string, languageHint: string | null): string {
  return `You are "Zorro", the friendly chat and voice assistant inside the Zorro app.
${APP_GUIDE}

USER CONTEXT (live, from the app; the only source for the user's numbers):
${context}

RULES
- Reply in the same language the user used${languageHint ? ` (detected: ${languageHint})` : ""}. Hindi, Tamil, Bengali and other Indian languages are welcome; keep crypto words like ZEC, USDC in English.
- This is often spoken aloud: keep replies to 1-4 short sentences unless the user asks for detail. No markdown tables.
- Use only the USER CONTEXT for balances, payees, payments and prices. Never invent numbers. If something isn't there, say so.
- You cannot move money. To help the user do something, add an action; the app shows a card with a "Review & confirm" button that opens the pre-filled screen (payments and swaps are then confirmed with "slide to pay/swap"; Autopay with "Start Autopay"). Don't promise anything happened.
- No investment advice or price predictions. You may describe recent price moves and news.
- Never ask for, guess or repeat seed phrases, private keys or addresses.

ACTIONS (0-3 per answer; only when useful)
{"type":"chart","asset":"ZEC|BTC|ETH|SOL|NEAR","range":"1d|7d|30d|90d"}  for price, trend or "show me a graph"
{"type":"balances"}  for "what's my balance" / holdings
{"type":"news"}  for latest Zcash news
{"type":"pay","payee":"<exact approved payee name>","amount":"500","currency":"INR|USD|COIN"}
{"type":"autopay","payee":"<exact approved payee name>","amount":"15000","currency":"INR|USD|COIN","frequency":"weekly|monthly","day":1}  (weekly day 0=Sunday…6=Saturday; monthly 1-28)
{"type":"swap","from":"<coin key>","to":"<coin key>","amount":"0.1"}  (amount in the "from" coin; coin keys: ${COINS.map((c) => c.key).join(", ")}; plain "USDC" means usdc-base)
{"type":"open","screen":"${Object.keys(SCREENS).join("|")}"}
If the user wants to pay someone who isn't an approved payee, explain they must add and approve them first, and add {"type":"open","screen":"payees"}.

Answer with ONE JSON object only: {"reply":"…","language":"<BCP-47 code of your reply, e.g. en-IN or hi-IN>","actions":[…]}`;
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new AiError("The assistant's answer wasn't readable.");
  }
}

async function runModel(system: string, history: ChatTurn[], text: string): Promise<z.infer<typeof ModelAnswer>> {
  if (sarvamConfigured()) {
    try {
      const raw = await chat([{ role: "system", content: system }, ...history, { role: "user", content: text }], { json: true });
      const parsed = ModelAnswer.safeParse(parseJsonObject(raw));
      if (parsed.success) return parsed.data;
    } catch (e) {
      if (!aiConfigured()) throw e;
      // fall through to the backup model
    }
  }
  if (!aiConfigured()) throw new AiError("The assistant isn't set up on this server.");
  const transcript = history.map((t) => `${t.role === "user" ? "User" : "Zorro"}: ${t.content}`).join("\n");
  const { data } = await aiJson({ system, user: `${transcript ? `${transcript}\n` : ""}User: ${text}`, schema: ModelAnswer, maxTokens: 900, temperature: 0.3 });
  return data;
}

// ---------- Entry point ----------

export async function askAssistant(user: CurrentUser, input: { text: string; history: ChatTurn[]; language: string | null }): Promise<AssistantReply> {
  const text = input.text.trim();
  if (!text) throw new AiError("Say or type a question.");
  const history = input.history.slice(-8).map((t) => ({ role: t.role, content: t.content.slice(0, 1500) }));
  assertNoSensitiveData(`${text}\n${history.map((h) => h.content).join("\n")}`);

  const { text: context, balances } = await buildContext(user);
  assertNoSensitiveData(context); // belt and braces: the context never contains addresses
  const answer = await runModel(systemPrompt(context, input.language), history, text);

  const payees = (await listPayees(user).catch(() => [])).filter((p) => p.status === "approved");
  const actions: AssistantAction[] = [];
  let reply = answer.reply.trim();
  for (const raw of answer.actions) {
    const parsed = RawAction.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    if (a.type === "chart") actions.push(a);
    else if (a.type === "balances" && balances) actions.push({ type: "balances", balances });
    else if (a.type === "open") actions.push({ type: "open", ...SCREENS[a.screen] });
    else if (a.type === "news" && newsConfigured()) {
      const news = await getLatestNews().catch(() => null);
      if (news?.articles.length) {
        actions.push({ type: "news", items: news.articles.slice(0, 4).map((n) => ({ title: n.title, source: n.source.name, link: n.link, publishedAt: n.publishedAt })) });
      }
    } else if (a.type === "pay" || a.type === "autopay") {
      const payee = payees.find((p) => p.name.toLowerCase() === a.payee.trim().toLowerCase());
      if (!payee || !/^\d+(\.\d+)?$/.test(a.amount)) {
        actions.push({ type: "open", ...SCREENS.payees });
        continue;
      }
      if (a.type === "pay") {
        actions.push({
          type: "draft",
          kind: "pay",
          title: `Pay ${payee.name}`,
          detail: `${amountLabel(a.amount, a.currency, payee.coinKey)} · arrives as ${coin(payee.coinKey).symbol}`,
          href: `/pay?${new URLSearchParams({ to: payee.id, amount: a.amount, currency: a.currency })}`,
          coinKey: payee.coinKey,
        });
      } else {
        const day = a.frequency === "weekly" ? Math.min(6, Math.max(0, a.day)) : Math.min(28, Math.max(1, a.day));
        actions.push({
          type: "draft",
          kind: "autopay",
          title: `Autopay ${payee.name}`,
          detail: `${amountLabel(a.amount, a.currency, payee.coinKey)} · ${describeSchedule({ frequency: a.frequency, day })}`,
          href: `/autopay?${new URLSearchParams({ new: "1", payee: payee.id, amount: a.amount, currency: a.currency, frequency: a.frequency, day: String(day) })}`,
          coinKey: payee.coinKey,
        });
      }
    } else if (a.type === "swap" && a.from !== a.to && /^\d+(\.\d+)?$/.test(a.amount)) {
      const from = findCoin(a.from)!;
      const to = findCoin(a.to)!;
      actions.push({
        type: "draft",
        kind: "swap",
        title: `Swap ${from.symbol} → ${to.symbol}`,
        detail: `${a.amount} ${from.symbol} to ${to.symbol}${to.symbol === "USDC" || to.symbol === "USDT" ? ` on ${to.chainName}` : ""}`,
        href: `/wallet/swap?${new URLSearchParams({ from: from.key, to: to.key, amount: a.amount })}`,
        coinKey: to.key,
      });
    }
  }
  if (!reply) reply = "Here you go.";
  return { reply, language: answer.language ?? input.language ?? "en-IN", actions: actions.slice(0, 3) };
}
