"use client";

import { useEffect, useState } from "react";
import { History, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import type { BacktestResult, PricePoint } from "@/lib/bots/backtest";
import type { BotConfig } from "@/lib/bots/config";
import { BacktestChart } from "./BacktestChart";

type Range = "7d" | "30d" | "90d";
type Response = { range: Range; points: PricePoint[]; result: BacktestResult };

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: n < 100 ? 2 : 0 })}`;

/**
 * "What would this bot have done?" on real ZEC prices. Runs on demand, or automatically
 * when `autoRun` is set (the AI assistant uses that).
 */
export function BacktestPanel({ config, autoRun = false, canExplain = true }: { config: BotConfig; autoRun?: boolean; canExplain?: boolean }) {
  const [range, setRange] = useState<Range>("30d");
  const [result, setResult] = useState<(Response & { forConfig: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const configKey = JSON.stringify(config);
  // A result only counts for the settings it was run with; editing the bot hides it.
  const data = result && result.forConfig === configKey ? result : null;

  async function run(r: Range) {
    setBusy(true);
    setError(null);
    setExplanation(null);
    try {
      setResult({ ...(await api<Response>("/api/backtest", { config, range: r })), forConfig: configKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setBusy(false);
    }
  }

  // Settings changed: the old result no longer applies. Auto-run again if asked to.
  useEffect(() => {
    let cancelled = false;
    if (autoRun) {
      api<Response>("/api/backtest", { config: JSON.parse(configKey), range: "30d" })
        .then((d) => {
          if (cancelled) return;
          setResult({ ...d, forConfig: configKey });
          setError(null);
          setExplanation(null);
        })
        .catch((e) => !cancelled && setError(e.message));
    }
    return () => {
      cancelled = true;
    };
  }, [configKey, autoRun]);

  async function explain() {
    if (!data) return;
    setExplaining(true);
    try {
      const { explanation } = await api<{ explanation: string }>("/api/ai/explain", { config, result: data.result });
      setExplanation(explanation);
    } catch (e) {
      setExplanation(e instanceof Error ? `Couldn't explain: ${e.message}` : "Couldn't explain");
    } finally {
      setExplaining(false);
    }
  }

  const r = data?.result;
  const vsHold = r ? r.endValueUsd - r.holdValueUsd : 0;

  return (
    <section className="panel p-5" aria-labelledby="bt-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="bt-heading" className="eyebrow flex items-center gap-2">
          <History size={13} aria-hidden="true" /> Backtest
        </h2>
        <div className="flex rounded-full border border-line p-0.5 font-mono text-[10px] tracking-[0.1em]" role="group" aria-label="Backtest period">
          {(["7d", "30d", "90d"] as const).map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => {
                setRange(x);
                void run(x);
              }}
              aria-pressed={data?.range === x || (!data && range === x)}
              className={`rounded-full px-2.5 py-1 uppercase transition-colors ${data?.range === x ? "bg-fox text-snow" : "text-muted hover:text-snow"}`}
            >
              {x}
            </button>
          ))}
        </div>
      </div>

      {!data && !busy && !error && (
        <button type="button" onClick={() => run(range)} className="btn-secondary mt-4 min-h-10 w-full text-[13px]">
          What would it have done in the last 30 days?
        </button>
      )}
      {busy && <div className="mt-4 h-40 animate-pulse rounded-xl bg-surface" aria-label="Running backtest" />}
      {error && <p className="mt-3 text-sm text-down">{error}</p>}

      {r && data && !busy && (
        <div className="mt-4">
          <BacktestChart points={data.points} trades={r.trades} />
          <p className="mt-3 text-sm leading-relaxed">{r.summary}</p>
          <div className="tabular mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Put in", value: r.startValueUsd },
              { label: "Bot ends with", value: r.endValueUsd },
              { label: "Just holding", value: r.holdValueUsd },
            ].map((x) => (
              <div key={x.label} className="rounded-xl border border-line bg-ink/50 px-2 py-2.5">
                <p className="eyebrow text-[8px]">{x.label}</p>
                <p className="mt-1 text-sm">{money(x.value)}</p>
              </div>
            ))}
          </div>
          <p className={`mt-2 text-center text-xs ${vsHold >= 0 ? "text-up" : "text-down"}`}>
            {vsHold >= 0 ? "+" : "−"}
            {money(Math.abs(vsHold))} versus holding · {money(r.feesUsd)} in fees
          </p>
          <dl className="tabular mt-3 text-sm">
            {r.stats.map((s) => (
              <div key={s.label} className="flex justify-between gap-3 border-t border-line py-2">
                <dt className="text-muted">{s.label}</dt>
                <dd className="text-right">{s.value}</dd>
              </div>
            ))}
          </dl>

          {canExplain && (
            <>
              {explanation ? (
                <p className="mt-3 rounded-xl border border-fox/40 bg-fox/10 px-3 py-2.5 text-sm leading-relaxed">
                  <Sparkles size={13} className="mr-1.5 inline text-fox-light" aria-hidden="true" />
                  {explanation}
                </p>
              ) : (
                <button type="button" onClick={explain} disabled={explaining} className="btn-secondary mt-3 min-h-10 w-full text-[13px]">
                  <Sparkles size={14} aria-hidden="true" /> {explaining ? "Explaining…" : "Explain this with AI"}
                </button>
              )}
            </>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-dim">
            Simulated on hourly ZEC prices with fees (~0.6% per swap, 0.2% per limit order). Real fills can differ, and past
            prices don&apos;t predict future ones.
          </p>
        </div>
      )}
    </section>
  );
}
