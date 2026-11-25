"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";
import { api } from "@/lib/api-client";
import { useCurrency } from "@/lib/client-prefs";
import { formatFiat } from "@/lib/format";
import type { WalletBalances } from "@/lib/wallet-service";

/** Bot wallet balances (live from NEAR Intents) with Add funds / Withdraw. */
export function BalancesPanel() {
  const [currency] = useCurrency();
  const [data, setData] = useState<WalletBalances | null>(null);
  const [usdInr, setUsdInr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<WalletBalances>("/api/agent/balances"), api<{ usdInr: number }>("/api/price").catch(() => null)])
      .then(([balances, spot]) => {
        if (cancelled) return;
        setData(balances);
        setUsdInr(spot?.usdInr ?? null);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const fiat = (usd: number) => (currency === "INR" && usdInr ? formatFiat(usd * usdInr, "INR") : formatFiat(usd, "USD"));

  return (
    <section className="panel-hero p-5" aria-labelledby="balance-heading">
      <div className="flex items-center justify-between">
        <h2 id="balance-heading" className="eyebrow">
          Bot wallet balance
        </h2>
        <button type="button" onClick={() => setTick((t) => t + 1)} aria-label="Refresh balances" className="rounded-full p-1.5 text-muted hover:text-snow">
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="tabular mt-3 text-[38px] leading-none font-light tracking-[-0.03em]">
        {data ? fiat(data.totalUsd) : error ? "—" : <span className="inline-block h-9 w-40 animate-pulse rounded-lg bg-surface-2" />}
      </p>
      {error && <p className="mt-2 text-xs text-down">{error}</p>}

      {data && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-ink/50">
          {data.assets.map((a) => (
            <li key={a.key} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span>
                {a.symbol} <span className="text-xs text-muted">· {a.chainName}</span>
              </span>
              <span className="tabular text-right">
                {a.amount}
                {a.usd !== null && Number(a.amount) > 0 && <span className="block text-xs text-muted">{fiat(a.usd)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data?.budget?.limitUsd && (
        <p className="mt-3 text-xs text-muted">
          Today&apos;s budget: ${Number(data.budget.spentUsd ?? 0).toFixed(2)} of ${data.budget.limitUsd} used
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Link href="/bots/wallet/deposit" className="btn-primary min-h-11 text-[13px]">
          <ArrowDownToLine size={16} aria-hidden="true" /> Add funds
        </Link>
        <Link href="/bots/wallet/withdraw" className="btn-secondary min-h-11 text-[13px]">
          <ArrowUpFromLine size={16} aria-hidden="true" /> Withdraw
        </Link>
      </div>
    </section>
  );
}
