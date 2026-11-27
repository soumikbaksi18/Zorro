"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { coin, displayAmount } from "@/lib/coins";
import type { MonthSummary, PaymentView } from "@/lib/payments";
import { CoinBadge, StatusBadge, coinName, useFiat } from "@/components/money";
import { ErrorBox } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

type Data = {
  summary: MonthSummary;
  payments: PaymentView[];
  usdInr: number | null;
  today: { limitUsd: string | null; spentUsd: string | null; resetsAt: string | null } | null;
};
type Filter = "all" | "sent" | "received" | "autopay" | "open";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "received", label: "Received" },
  { value: "autopay", label: "Autopay" },
  { value: "open", label: "In progress" },
];

export function Tracker() {
  const account = useAccount();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(20);
  const { fmt } = useFiat();
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  useEffect(() => {
    if (!hasWallet) return;
    let cancelled = false;
    const load = () =>
      api<Data>("/api/tracker")
        .then((d) => !cancelled && setData(d))
        .catch((e: Error) => !cancelled && setError(e.message));
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasWallet]);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to see your payments" />;
  if (!hasWallet) return <p className="panel p-5 text-sm text-muted">Create your wallet to start tracking payments.</p>;
  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <TrackerSkeleton />;

  const { summary, today } = data;
  const inr = (usd: number) => (data.usdInr ? usd * data.usdInr : null);
  const limit = Number(today?.limitUsd ?? 0);
  const spentToday = Number(today?.spentUsd ?? 0);
  const monthName = new Date(`${summary.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long" });

  const list = data.payments.filter((p) =>
    filter === "sent" ? p.direction === "out" : filter === "received" ? p.direction === "in" : filter === "autopay" ? p.kind === "autopay" : filter === "open" ? !["done", "failed"].includes(p.status) : true,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        <StatCard title={`Spent in ${monthName}`} value={fmt(summary.sentUsd, summary.sentInr)} sub={`${displayAmount(summary.zecSpent)} ZEC`} />
        <StatCard
          title="Today's limit"
          value={fmt(spentToday, inr(spentToday))}
          sub={limit ? `of ${fmt(limit, inr(limit))}` : "No limit info"}
          pct={limit ? Math.min(100, (spentToday / limit) * 100) : undefined}
        />
      </div>

      <section className="panel p-5" aria-labelledby="month-heading">
        <div className="flex items-baseline justify-between">
          <h2 id="month-heading" className="section-title">
            {monthName} at a glance
          </h2>
          <span className="text-xs text-muted">{summary.count} done</span>
        </div>
        <dl className="tabular mt-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="Received" value={fmt(summary.receivedUsd, summary.receivedInr)} tone="up" />
          <Mini label="Sent" value={fmt(summary.sentUsd, summary.sentInr)} />
          <Mini label="Fees" value={fmt(summary.feesUsd, inr(summary.feesUsd))} />
        </dl>
        {summary.byCoin.length > 0 && (
          <>
            <p className="eyebrow mt-5 mb-3">Where your ZEC went</p>
            <ul className="flex flex-col gap-3">
              {summary.byCoin.map((b) => {
                const pct = summary.sentUsd ? (b.usd / summary.sentUsd) * 100 : 0;
                return (
                  <li key={b.coinKey} className="flex items-center gap-3">
                    <CoinBadge coinKey={b.coinKey} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-sm">
                        <span>{coinName(coin(b.coinKey))}</span>
                        <span className="tabular text-snow/80">{fmt(b.usd, inr(b.usd))}</span>
                      </div>
                      <div className="meter mt-1.5">
                        <span style={{ width: `${Math.max(3, pct)}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filter payments">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" onClick={() => setFilter(f.value)} aria-pressed={filter === f.value} className="chip">
            {f.label}
          </button>
        ))}
      </div>

      <section aria-labelledby="receipts-heading">
        <h2 id="receipts-heading" className="sr-only">
          Receipts
        </h2>
        {list.length === 0 ? (
          <p className="panel p-6 text-center text-sm text-muted">{data.payments.length ? "Nothing here for this filter." : "Your receipts will appear here after your first payment."}</p>
        ) : (
          <ul className="flex flex-col">
            {list.slice(0, shown).map((p, i) => (
              <li key={p.id} className={i === 0 ? "" : "-mt-7"} style={{ zIndex: i }}>
                <ReceiptCard p={p} shade={i % 3} />
              </li>
            ))}
          </ul>
        )}
        {list.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + 20)} className="btn-secondary mt-4 w-full">
            Show more
          </button>
        )}
      </section>
    </div>
  );
}

function ReceiptCard({ p, shade }: { p: PaymentView; shade: number }) {
  const { fmt } = useFiat();
  const c = coin(p.coinKey);
  const out = p.direction === "out";
  const tag = out ? (p.fundCoinKey !== p.coinKey ? `ZEC → ${c.symbol}` : `Paid in ${c.symbol}`) : p.kind === "request" ? `${coin(p.fundCoinKey).symbol} → ZEC` : `+ ${c.symbol}`;
  return (
    <Link href={`/pay/${p.id}`} className={`receipt receipt-${shade} relative block shadow-[0_-12px_30px_-18px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zec-ink/65">{out ? p.counterparty : `From ${p.counterparty}`}</p>
          <p className={`tabular mt-1 text-[34px] leading-tight font-semibold tracking-[-0.04em] ${p.status === "failed" ? "line-through opacity-50" : ""}`}>
            {out ? "" : "+"}
            {fmt(p.usd, p.inr)}
          </p>
        </div>
        <span className="mt-1 shrink-0 text-[13px] font-medium text-zec-ink/60">{tag}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <p className="text-zec-ink/55">Reference</p>
          <p className="mt-0.5 truncate font-mono font-medium">{p.reference ?? "—"}</p>
        </div>
        <div>
          <p className="text-zec-ink/55">{p.status === "done" ? "Date" : "Status"}</p>
          <p className="mt-0.5 font-medium">
            {p.status === "done" ? (
              new Date(p.completedAt ?? p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
            ) : (
              <span className="[&_*]:!text-zec-ink">
                <StatusBadge status={p.status} />
              </span>
            )}
          </p>
        </div>
      </div>
    </Link>
  );
}

function StatCard({ title, value, sub, pct }: { title: string; value: string; sub: string; pct?: number }) {
  return (
    <section className="panel flex flex-col justify-between p-4">
      <h2 className="text-[13px] text-snow/75">{title}</h2>
      <p className="tabular mt-3 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{value}</p>
      <p className="tabular mt-0.5 text-xs text-muted">{sub}</p>
      {pct !== undefined && (
        <div className="mt-3 flex items-center gap-2">
          <div className="meter flex-1">
            <span style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <span className="rounded-full bg-zec/15 px-1.5 py-0.5 text-[10px] font-semibold text-zec">{Math.round(pct)}%</span>
        </div>
      )}
    </section>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "up" }) {
  return (
    <div className="rounded-2xl bg-surface px-2 py-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`mt-1 text-sm font-medium ${tone === "up" ? "text-up" : ""}`}>{value}</dd>
    </div>
  );
}

function TrackerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3">
        <div className="panel h-32 animate-pulse" />
        <div className="panel h-32 animate-pulse" />
      </div>
      <div className="panel h-40 animate-pulse" />
      <div className="h-40 animate-pulse rounded-[26px] bg-cream/15" />
    </div>
  );
}
