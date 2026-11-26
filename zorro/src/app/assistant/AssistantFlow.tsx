"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageCircleQuestion, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import type { StrategyAnswer } from "@/lib/ai-strategy";
import { PasskeyGate } from "@/components/bots/PasskeyGate";
import { BacktestPanel } from "@/components/bots/BacktestPanel";

const EXAMPLES = [
  "Sell 0.05 ZEC if it drops 10%",
  "Buy $10 of ZEC every week, more on dips",
  "Take profits on 0.02 ZEC in 4 steps from $850",
  "Grid between $650 and $850 with small orders",
];

export function AssistantFlow() {
  const router = useRouter();
  const account = useAccount();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<StrategyAnswer | null>(null);
  const [busy, setBusy] = useState<"think" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (account.status === "loading") return <div className="panel h-48 animate-pulse" />;
  if (account.status === "error") return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account.</p>;
  if (!account.me.user) return <PasskeyGate title="Sign in to use the AI assistant" />;
  const hasWallet = account.me.agent?.status === "ACTIVE";

  async function think(request: string) {
    setBusy("think");
    setError(null);
    try {
      setAnswer(await api<StrategyAnswer>("/api/ai/strategy", { text: request }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant didn't answer");
    } finally {
      setBusy(null);
    }
  }

  async function start(mode: "paper" | "live") {
    if (answer?.status !== "ok") return;
    if (mode === "live" && !confirm("Start this bot LIVE? It will trade real funds from your bot wallet, within your signed limits.")) return;
    setBusy("start");
    setError(null);
    try {
      const bot = await api<{ id: string }>("/api/bots", {
        config: { ...answer.config, mode },
        ...(answer.name ? { name: `${answer.name}${mode === "paper" ? " (paper)" : ""}`.slice(0, 60) } : {}),
      });
      router.push(`/bots/${bot.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the bot");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="block">
        <span className="eyebrow mb-2 block px-1">Describe your strategy</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="e.g. Sell 0.05 ZEC if it drops 10%, and tell me what that would have done last month"
          className="field min-h-24 resize-none py-3 text-sm leading-relaxed"
        />
      </label>
      <div className="flex flex-wrap gap-2" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setText(ex)}
            className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted transition-colors hover:border-fox/60 hover:text-snow"
          >
            {ex}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => think(text)} disabled={busy !== null || text.trim().length < 4} className="btn-primary w-full">
        <Sparkles size={16} aria-hidden="true" /> {busy === "think" ? "Thinking…" : answer ? "Ask again" : "Build my bot"}
      </button>
      {error && (
        <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
          {error}
        </p>
      )}

      {answer?.status === "clarify" && (
        <section className="panel flex gap-3 p-4" aria-live="polite">
          <MessageCircleQuestion size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
          <div>
            <p className="text-sm">{answer.question}</p>
            <p className="mt-1 text-xs text-muted">Add the answer to your description above and ask again.</p>
          </div>
        </section>
      )}

      {answer?.status === "unsupported" && (
        <section className="panel flex gap-3 border-gold/40 p-4" aria-live="polite">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
          <p className="text-sm">{answer.reason}</p>
        </section>
      )}

      {answer?.status === "ok" && (
        <>
          <section className="panel-hero p-5" aria-live="polite" aria-labelledby="proposal-heading">
            <p className="eyebrow">Zorro suggests</p>
            <h2 id="proposal-heading" className="mt-2 text-lg font-light tracking-[-0.02em]">
              {answer.name ?? "Your bot"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{answer.description}.</p>
            <p className="mt-3 text-sm leading-relaxed text-snow/80">{answer.explanation}</p>
            {answer.assumptions.length > 0 && (
              <div className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5">
                <p className="eyebrow text-[9px] text-gold">Assumptions to check</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-snow/85">
                  {answer.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <BacktestPanel config={answer.config} autoRun />

          {hasWallet ? (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => start("paper")} disabled={busy !== null} className="btn-primary min-h-11 text-[13px]">
                {busy === "start" ? "Starting…" : "Start paper bot"}
              </button>
              <button type="button" onClick={() => start("live")} disabled={busy !== null} className="btn-secondary min-h-11 text-[13px]">
                Start live
              </button>
            </div>
          ) : (
            <Link href="/bots/setup" className="btn-primary w-full">
              Create your bot wallet to start it
            </Link>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-dim">
        AI-powered. Only the text you type and today&apos;s ZEC price go to a third-party AI service, never your
        addresses, balances or keys. The assistant only drafts settings: nothing runs until you start it.
      </p>
    </div>
  );
}
