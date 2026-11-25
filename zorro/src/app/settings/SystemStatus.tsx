"use client";

import { useCallback, useEffect, useState } from "react";
import type { Check, HealthReport } from "@/lib/health";

const ROWS: { key: keyof HealthReport["checks"]; label: string }[] = [
  { key: "swaps", label: "Swaps (NEAR Intents)" },
  { key: "agentApi", label: "Bot wallets (Agent API)" },
  { key: "ai", label: "AI assistant" },
  { key: "worker", label: "Bot worker" },
  { key: "database", label: "Database" },
  { key: "encryption", label: "Encryption" },
];

async function requestHealth(): Promise<HealthReport | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return (await res.json()) as HealthReport;
  } catch {
    return null;
  }
}

export function SystemStatus() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((result: HealthReport | null) => {
    if (result) setReport(result);
    setFailed(result === null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestHealth().then((result) => !cancelled && apply(result));
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const recheck = async () => {
    setLoading(true);
    apply(await requestHealth());
  };

  return (
    <section className="panel" aria-label="System status">
      <div className="flex items-center justify-between p-4">
        <div>
          <h2 className="eyebrow text-snow/90">System status</h2>
          <p className="text-xs text-muted">
            {report ? `Checked ${new Date(report.checkedAt).toLocaleTimeString()}` : "Checking connections…"}
          </p>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={loading}
          className="rounded-full border border-line-strong px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase hover:border-fox-light disabled:opacity-40"
        >
          {loading ? "Checking…" : "Recheck"}
        </button>
      </div>
      {failed && <p className="px-4 pb-4 text-sm text-down">Couldn&apos;t reach Zorro&apos;s server.</p>}
      <ul className="divide-y divide-line border-t border-line">
        {ROWS.map(({ key, label }) => {
          const check: Check | undefined = report?.checks[key];
          return (
            <li key={key} className="flex items-start gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!check ? "animate-pulse bg-muted" : check.ok ? "bg-up" : "bg-down"}`}
              />
              <div className="min-w-0">
                <p className="text-sm">{label}</p>
                <p className="text-xs text-muted">
                  {check ? (
                    <>
                      <span className="sr-only">{check.ok ? "Working. " : "Problem. "}</span>
                      {check.detail}
                    </>
                  ) : (
                    "…"
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
