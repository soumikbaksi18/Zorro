"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { MarketRow } from "@/lib/markets";
import { useCurrency } from "@/lib/client-prefs";
import { formatFiat } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, TONE_CLASSES } from "@/lib/swap-status";
import { useSwaps } from "@/lib/swap-store";

type Tab = "activity" | "markets";

/** Right-hand overview panel: Activity / Markets tabs (after Zeno's overview). */
export function OverviewPanel() {
  const [tab, setTab] = useState<Tab>("activity");

  return (
    <section className="panel flex flex-col">
      <div className="tabs px-3 pt-1" role="tablist" aria-label="Overview">
        {(["activity", "markets"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-controls={`panel-${key}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="tab"
          >
            {key === "activity" ? "Activity" : "Markets"}
          </button>
        ))}
        {tab === "activity" && (
          <Link
            href="/orders"
            className="ml-auto inline-flex items-center gap-1 pr-1 font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-fox-light"
          >
            View all <ArrowUpRight size={12} />
          </Link>
        )}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex-1 p-3">
        {tab === "activity" ? <Activity /> : <Markets />}
      </div>
    </section>
  );
}

function Activity() {
  const swaps = useSwaps();
  if (swaps === null) return <div className="h-24 animate-pulse rounded-xl bg-surface" />;
  if (swaps.length === 0) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 px-2 py-6">
        <p className="text-sm text-muted">No activity yet. Swaps and bot trades will show up here.</p>
        <Link href="/swap" className="btn-secondary min-h-10 px-4 text-[13px]">
          Make a swap
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {swaps.slice(0, 6).map((s) => {
        const selling = s.quote.direction === "sell";
        return (
          <li key={s.id}>
            <Link
              href={`/swap/${encodeURIComponent(s.id)}`}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {selling ? "Sold" : "Bought"} {selling ? s.quote.send.amount : s.quote.receive.amount} ZEC
                </p>
                <p className="tabular mt-0.5 truncate text-xs text-muted">
                  {selling ? `→ ${s.quote.receive.amount} USDC` : `with ${s.quote.send.amount} USDC`} ·{" "}
                  {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${TONE_CLASSES[STATUS_TONE[s.status]]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Markets() {
  const [currency] = useCurrency();
  const [rows, setRows] = useState<MarketRow[] | null>(null);
  const [usdInr, setUsdInr] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/markets").then((r) => r.json()), fetch("/api/price").then((r) => r.json())])
      .then(([markets, spot]) => {
        if (cancelled) return;
        if (!Array.isArray(markets)) throw new Error();
        setRows(markets);
        setUsdInr(typeof spot?.usdInr === "number" ? spot.usdInr : null);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="px-2 py-8 text-sm text-muted">Markets are unavailable right now.</p>;
  if (!rows) return <div className="h-40 animate-pulse rounded-xl bg-surface" />;

  const showInr = currency === "INR" && usdInr;
  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.symbol} className="flex items-center gap-3 px-2 py-3">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold ${
                r.symbol === "ZEC" ? "bg-gold/15 text-gold" : "bg-surface-2 text-muted"
              }`}
              aria-hidden="true"
            >
              {r.symbol.slice(0, 3)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.symbol}</p>
              <p className="text-xs text-muted">{r.name}</p>
            </div>
            <p className="tabular text-sm">{formatFiat(showInr ? r.priceUsd * usdInr! : r.priceUsd, showInr ? "INR" : "USD")}</p>
          </li>
        ))}
      </ul>
      <p className="eyebrow px-2 pt-2 text-[9px] text-dim">Prices from NEAR Intents</p>
    </>
  );
}
