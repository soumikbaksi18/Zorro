"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Repeat } from "lucide-react";
import { api } from "@/lib/api-client";
import { coin, displayAmount } from "@/lib/coins";
import type { PaymentView } from "@/lib/payments";
import { StatusBadge, coinName, useFiat } from "@/components/money";
import { CopyButton, ErrorBox } from "@/components/ui";

const ACTIVE = new Set(["queued", "converting", "sending"]);

export function Receipt({ id }: { id: string }) {
  const [p, setP] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { fmt } = useFiat();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      api<PaymentView>(`/api/payments/${encodeURIComponent(id)}`)
        .then((d) => {
          if (cancelled) return;
          setP(d);
          setError(null);
          if (ACTIVE.has(d.status)) timer = setTimeout(load, 3_000);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error && !p) return <ErrorBox message={error} />;
  if (!p) return <div className="h-72 animate-pulse rounded-[26px] bg-tint-1/20" />;

  const c = coin(p.coinKey);
  const fund = coin(p.fundCoinKey);
  const out = p.direction === "out";
  const date = new Date(p.completedAt ?? p.createdAt);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/tracker" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted hover:text-snow">
        <ChevronLeft size={18} aria-hidden="true" /> Tracker
      </Link>

      <article className="receipt receipt-1" aria-label="Receipt">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-brand-ink/60">{p.kind === "swap" ? p.counterparty : out ? `Paid to ${p.counterparty}` : `From ${p.counterparty}`}</p>
          <span className="rounded-full bg-brand-ink/8 px-2.5 py-1 text-xs font-medium text-brand-ink/70">{out ? `Paid in ${c.symbol}` : `Arrived as ${c.symbol}`}</span>
        </div>
        <p className="tabular mt-3 text-[44px] leading-none font-semibold tracking-[-0.04em]">
          {out ? "" : "+"}
          {fmt(p.usd)}
        </p>
        <p className="tabular mt-2 text-sm text-brand-ink/70">
          {displayAmount(p.amount)} {coinName(c)}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-brand-ink/55">Reference</p>
            <p className="mt-0.5 font-mono text-[13px] font-medium">{p.reference ?? "—"}</p>
          </div>
          <div>
            <p className="text-brand-ink/55">Date</p>
            <p className="mt-0.5 text-[13px] font-medium">{date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
          </div>
        </div>
      </article>

      <section className="panel p-5" aria-labelledby="status-heading">
        <div className="flex items-center justify-between">
          <h2 id="status-heading" className="section-title">
            Status
          </h2>
          <StatusBadge status={p.status} />
        </div>
        {out && p.steps && <Steps p={p} />}
        {p.error && <p className="mt-4 text-sm leading-relaxed text-down">{p.error}</p>}
      </section>

      <section className="panel p-5" aria-label="Details">
        <dl className="tabular space-y-2.5 text-sm">
          {p.fundAmount && (
            <Row label={out ? "You paid" : p.kind === "request" ? "They paid" : "Received"}>
              {displayAmount(p.fundAmount)} {coinName(fund)}
            </Row>
          )}
          <Row label={out ? "They received" : "You received"}>
            {displayAmount(p.amount)} {coinName(c)}
          </Row>
          {p.zecUsd && <Row label="ZEC price then">{fmt(p.zecUsd)}</Row>}
          {p.feeUsd !== null && <Row label="Fees">≈ {fmt(p.feeUsd)}</Row>}
          <Row label="Type">{{ pay: "Payment", transfer: "Zorro transfer", autopay: "Autopay", request: "Payment link", deposit: "Added money", swap: "Swap" }[p.kind] ?? p.kind}</Row>
          {p.note && <Row label="Note">{p.note}</Row>}
        </dl>
        {p.reference && (
          <div className="mt-4 flex justify-end">
            <CopyButton value={p.reference} label="Copy reference" />
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/" className="btn-secondary">
          Home
        </Link>
        {p.kind === "swap" ? (
          <Link href={`/wallet/swap?from=${p.fundCoinKey}&to=${p.coinKey}`} className="btn-primary">
            <Repeat size={16} aria-hidden="true" /> Swap again
          </Link>
        ) : out && p.kind !== "deposit" ? (
          <Link href="/pay" className="btn-primary">
            <Repeat size={16} aria-hidden="true" /> Pay again
          </Link>
        ) : (
          <Link href="/tracker" className="btn-primary">
            Tracker
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Steps({ p }: { p: PaymentView }) {
  const steps = [
    ...(p.steps?.needsSwap ? [{ key: "converting", label: `Convert ${coin(p.fundCoinKey).symbol} to ${coin(p.coinKey).symbol}` }] : []),
    ...(p.steps?.route === "swap"
      ? []
      : [{ key: "sending", label: p.steps?.route === "transfer" ? "Send to their Zorro wallet" : `Send on ${coin(p.coinKey).chainName}` }]),
    { key: "done", label: p.steps?.route === "swap" ? `${coin(p.coinKey).symbol} in your wallet` : "Delivered" },
  ];
  const order = ["queued", ...steps.map((s) => s.key)];
  const at = p.status === "failed" || p.status === "review" ? -1 : order.indexOf(p.status);
  return (
    <ol className="mt-4 flex flex-col gap-3">
      {steps.map((s, i) => {
        const idx = i + 1;
        const done = at > idx || p.status === "done";
        const current = at === idx && p.status !== "done";
        return (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                done ? "border-up bg-up text-ink" : current ? "border-brand text-brand" : "border-line-strong text-dim"
              }`}
              aria-hidden="true"
            >
              {done ? <Check size={14} /> : current ? <span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> : <span className="h-1.5 w-1.5 rounded-full bg-dim" />}
            </span>
            <span className={done ? "" : current ? "text-snow" : "text-muted"}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
