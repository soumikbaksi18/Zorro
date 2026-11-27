"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Eye,
  EyeOff,
  HandCoins,
  Plus,
  ReceiptText,
  Repeat,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { useHideBalance } from "@/lib/client-prefs";
import { findCoin } from "@/lib/coins";
import type { PaymentView } from "@/lib/payments";
import type { WalletBalances } from "@/lib/wallet-service";
import { BigFiat, CoinBadge, coinName, useFiat, useNow, when } from "@/components/money";
import { BrandMark } from "@/components/shell/Brand";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

type HomeData = { balances: WalletBalances; recent: PaymentView[]; pendingPayees: number; handle: string | null };

const ACTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/pay", label: "Pay", icon: Send },
  { href: "/request", label: "Request", icon: HandCoins },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/autopay", label: "Autopay", icon: Repeat },
  { href: "/payees", label: "Payees", icon: Users },
  { href: "/wallet/receive", label: "Add money", icon: ArrowDownLeft },
  { href: "/tracker", label: "Tracker", icon: ReceiptText },
  { href: "/ask", label: "Ask AI", icon: Sparkles },
];

export function HomeScreen() {
  const account = useAccount();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  useEffect(() => {
    if (!hasWallet) return;
    let cancelled = false;
    const load = () =>
      api<HomeData>("/api/wallet/home")
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    void load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasWallet]);

  if (account.status === "loading") return <HomeSkeleton />;
  if (account.status === "error") return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account. Check your connection.</p>;
  if (!account.me.user) return <Welcome />;

  const handle = data?.handle ?? account.me.user.handle;
  return (
    <div className="flex flex-col gap-7">
      <Greeting handle={handle} alerts={data?.pendingPayees ?? 0} />
      {hasWallet ? (
        <>
          <Balance data={data} error={error} />
          {data && data.pendingPayees > 0 && (
            <Link href="/payees" className="notice">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
              <span>
                <strong>
                  {data.pendingPayees} payee{data.pendingPayees === 1 ? "" : "s"} waiting for approval
                </strong>
                <p>Approve them with Face ID so you can pay them.</p>
              </span>
            </Link>
          )}
          <QuickActions />
          <LastPayments items={data?.recent ?? null} />
        </>
      ) : (
        <CreateWalletCard pending={account.me.agent?.status === "PENDING"} />
      )}
    </div>
  );
}

function Greeting({ handle, alerts }: { handle: string | null; alerts: number }) {
  return (
    <header className="flex items-center justify-between">
      <Link href="/account" className="flex items-center gap-3">
        <BrandMark size={44} />
        <span className="text-[19px] font-light text-snow/80">
          Hello{handle ? <strong className="font-medium text-snow">, @{handle}</strong> : <strong className="font-medium text-snow">!</strong>}
        </span>
      </Link>
      <Link
        href={alerts ? "/payees" : "/tracker"}
        aria-label={alerts ? `${alerts} payees waiting for approval` : "Payment tracker"}
        className="relative grid h-11 w-11 place-items-center rounded-full bg-white/8 text-snow backdrop-blur hover:bg-white/12"
      >
        <Bell size={19} strokeWidth={1.7} aria-hidden="true" />
        {alerts > 0 && <span className="absolute top-2.5 right-3 h-2 w-2 rounded-full bg-zec ring-2 ring-ink" />}
      </Link>
    </header>
  );
}

function Balance({ data, error }: { data: HomeData | null; error: string | null }) {
  const { currency, fmt } = useFiat();
  const [hidden, toggle] = useHideBalance();
  const b = data?.balances;
  const total = b ? (currency === "INR" ? b.totalInr : b.totalUsd) : null;
  const zec = b?.coins.find((c) => c.key === "zec");

  return (
    <section aria-labelledby="balance-heading" className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 id="balance-heading" className="text-[15px] text-snow/70">
            Total balance
          </h2>
          <button type="button" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} className="text-muted hover:text-snow">
            {hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        </div>
        <p className="mt-1 text-[44px] leading-tight font-semibold">
          {total === null ? <span className="inline-block h-11 w-48 animate-pulse rounded-xl bg-white/8 align-middle" /> : <BigFiat value={total} currency={currency} hidden={hidden} />}
        </p>
        {error && !b && <p className="mt-1 text-sm text-down">{error}</p>}
        {zec && !hidden && (
          <p className="tabular mt-1 text-sm text-snow/60">
            {Number(zec.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} ZEC
            {b?.zecUsd ? ` · 1 ZEC = ${fmt(b.zecUsd, b.zecUsd * b.usdInr)}` : ""}
          </p>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Wallet</h2>
          <Link href="/wallet/receive" className="flex items-center gap-1 text-sm text-snow/80 hover:text-snow">
            Add <Plus size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
          {b
            ? b.coins.map((c, i) => <CoinCard key={c.key} coin={c} primary={i === 0} hidden={hidden} fiat={fmt(c.usd, c.inr)} />)
            : [0, 1].map((i) => <div key={i} className="h-[170px] w-[160px] shrink-0 animate-pulse rounded-[22px] bg-white/6" />)}
          <Link
            href="/wallet/receive"
            className="grid h-[170px] w-[120px] shrink-0 snap-start place-items-center rounded-[22px] border border-dashed border-line-strong text-sm text-muted hover:border-zec hover:text-snow"
          >
            <span className="flex flex-col items-center gap-2">
              <Plus size={20} aria-hidden="true" />
              Add money
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

function CoinCard({ coin: c, primary, hidden, fiat }: { coin: WalletBalances["coins"][number]; primary: boolean; hidden: boolean; fiat: string }) {
  const meta = findCoin(c.key);
  return (
    <article className={`${primary ? "glass-card" : "glass-card-dark"} flex h-[170px] w-[160px] shrink-0 snap-start flex-col justify-between p-4`}>
      <div className="flex items-start justify-between">
        <CoinBadge coinKey={c.key} size={30} />
        <span className={`text-xs font-semibold tracking-wide ${primary ? "text-zec-ink/70" : "text-snow/60"}`}>{meta?.chainName}</span>
      </div>
      <div>
        <p className={`text-[11px] ${primary ? "text-zec-ink/70" : "text-snow/60"}`}>{primary ? "Private cash" : coinName(meta)}</p>
        <p className="tabular mt-0.5 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{hidden ? "••••" : fiat}</p>
        <p className={`tabular mt-1 text-[11px] ${primary ? "text-zec-ink/70" : "text-snow/60"}`}>
          {hidden ? "••••" : `${Number(c.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${c.symbol}`}
        </p>
      </div>
    </article>
  );
}

function QuickActions() {
  return (
    <section className="panel p-5" aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="section-title">
        Quick actions
      </h2>
      <ul className="mt-4 grid grid-cols-4 gap-y-5">
        {ACTIONS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="group flex flex-col items-center gap-2 text-center text-xs text-snow/75 hover:text-snow">
              <span className="grid h-11 w-11 place-items-center rounded-2xl text-zec-light transition-colors group-hover:bg-white/6">
                <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LastPayments({ items }: { items: PaymentView[] | null }) {
  return (
    <section aria-labelledby="last-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="last-heading" className="section-title">
          Last payments
        </h2>
        <Link href="/tracker" className="flex items-center gap-1 text-sm text-zec hover:text-zec-light">
          View all <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {items === null ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel h-[68px] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel p-5 text-center text-sm text-muted">
          No payments yet.{" "}
          <Link href="/wallet/receive" className="text-zec">
            Add ZEC
          </Link>{" "}
          and make your first payment.
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((p) => (
            <li key={p.id}>
              <PaymentRow p={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PaymentRow({ p }: { p: PaymentView }) {
  const { fmt } = useFiat();
  const now = useNow();
  const c = findCoin(p.coinKey);
  const out = p.direction === "out";
  const kindLabel = { pay: "Payment", transfer: "Zorro transfer", autopay: "Autopay", request: "Payment link", deposit: "Added" }[p.kind] ?? p.kind;
  return (
    <Link href={`/pay/${p.id}`} className="panel flex items-center gap-3 p-3.5 transition-colors hover:border-line-strong">
      <span className="relative">
        <CoinBadge coinKey={p.coinKey} size={40} />
        <span
          className={`absolute -right-1 -bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full ring-2 ring-panel ${out ? "bg-surface-2 text-snow" : "bg-up text-ink"}`}
          aria-hidden="true"
        >
          {out ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[15px] font-medium">{p.counterparty}</strong>
        <span className="block truncate text-xs text-muted">
          {when(p.createdAt, now)} · {p.status === "done" ? kindLabel : p.status === "failed" ? "Failed" : "In progress"}
        </span>
      </span>
      <span className="text-right">
        <strong className={`tabular block text-[15px] font-medium ${p.status === "failed" ? "text-dim line-through" : out ? "" : "text-up"}`}>
          {out ? "−" : "+"}
          {fmt(p.usd, p.inr)}
        </strong>
        <span className="tabular block text-xs text-muted">
          {Number(p.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} {c?.symbol}
        </span>
      </span>
    </Link>
  );
}

function CreateWalletCard({ pending }: { pending: boolean }) {
  return (
    <section className="glass-card p-6">
      <p className="text-sm font-medium text-zec-ink/70">Step 2 of 2</p>
      <h2 className="mt-2 text-2xl leading-tight font-semibold tracking-[-0.03em]">Create your private Zorro wallet</h2>
      <p className="mt-2 text-sm leading-relaxed text-zec-ink/80">
        One Face ID. Hold ZEC, pay anyone in the coin they want, and set up Autopay. Zorro can only pay people you approve, up to your daily limit.
      </p>
      <Link href="/wallet/setup" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-zec-ink px-6 text-sm font-semibold text-zec">
        {pending ? "Finish setting up" : "Create wallet"}
      </Link>
    </section>
  );
}

function Welcome() {
  return (
    <div className="flex flex-col gap-7 pt-4">
      <BrandMark size={56} />
      <div>
        <h2 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.04em]">
          Private cash.
          <br />
          <span className="text-zec">Pay in any coin.</span>
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-snow/70">
          Hold ZEC and pay anyone, in USDC, SOL, BTC or whatever they want. Autopay your regular payments and track every one.
        </p>
      </div>
      <ul className="flex flex-col gap-3 text-sm text-snow/80">
        {[
          "Pay people and apps in 13 coins across 8 chains",
          "Autopay rent, family and freelancers",
          "Every payee approved with your Face ID",
        ].map((t) => (
          <li key={t} className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zec/15 text-zec">
              <ShieldCheck size={14} aria-hidden="true" />
            </span>
            {t}
          </li>
        ))}
      </ul>
      <PasskeyGate title="Start with a passkey" />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-7" aria-label="Loading">
      <div className="h-11 w-48 animate-pulse rounded-full bg-white/6" />
      <div className="h-14 w-64 animate-pulse rounded-xl bg-white/6" />
      <div className="flex gap-3">
        <div className="h-[170px] w-[160px] animate-pulse rounded-[22px] bg-white/6" />
        <div className="h-[170px] w-[160px] animate-pulse rounded-[22px] bg-white/6" />
      </div>
      <div className="panel h-52 animate-pulse" />
    </div>
  );
}
