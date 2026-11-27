"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  Eye,
  EyeOff,
  HandCoins,
  ReceiptText,
  Repeat,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { useHideBalance } from "@/lib/client-prefs";
import { findCoin } from "@/lib/coins";
import type { PaymentView } from "@/lib/payments";
import type { WalletBalances } from "@/lib/wallet-service";
import { BigFiat, CoinBadge, useFiat, useNow, when } from "@/components/money";
import { BrandMark } from "@/components/shell/Brand";
import { Landing } from "@/components/landing/Landing";

type HomeData = { balances: WalletBalances; recent: PaymentView[]; pendingPayees: number; handle: string | null };

const ACTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/pay", label: "Pay", icon: Send },
  { href: "/request", label: "Request", icon: HandCoins },
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/autopay", label: "Autopay", icon: Repeat },
  { href: "/wallet/swap", label: "Swap", icon: ArrowLeftRight },
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
  if (!account.me.user) return <Landing />;

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
    <header>
      <div className="flex items-center justify-between">
        <Link href="/account" aria-label="Account">
          <BrandMark size={46} />
        </Link>
        <div className="flex items-center gap-3">
          <PoweredByNear />
          <Link href={alerts ? "/payees" : "/tracker"} aria-label={alerts ? `${alerts} payees waiting for approval` : "Payment tracker"} className="icon-btn relative">
            <Bell size={19} strokeWidth={1.7} aria-hidden="true" />
            {alerts > 0 && <span className="absolute top-2.5 right-3 h-2 w-2 rounded-full bg-gold ring-2 ring-ink" />}
          </Link>
        </div>
      </div>
      <h2 className="page-title mt-5">{handle ? `Hi, @${handle}` : "Your wallet"}</h2>
    </header>
  );
}

/** "Powered by NEAR Intents", small and quiet in the top-right corner. */
export function PoweredByNear() {
  return (
    <a href="https://near-intents.org" target="_blank" rel="noopener noreferrer" className="text-right leading-none text-snow/45 hover:text-snow/70" aria-label="Powered by NEAR Intents">
      <span className="block text-[10px] font-medium">Powered by</span>
      <span className="mt-0.5 block text-[15px] tracking-[-0.03em]">
        <strong className="font-bold">near</strong> <span className="font-medium">Intents</span>
      </span>
    </a>
  );
}

// Asset boxes under the main card. The first three always show; the rest only when you hold them.
const ASSET_BOXES: { symbol: string; keys: string[]; always: boolean }[] = [
  { symbol: "ZEC", keys: ["zec"], always: true },
  { symbol: "USDC", keys: ["usdc-base", "usdc-sol", "usdc-eth", "usdc-arb"], always: true },
  { symbol: "SOL", keys: ["sol"], always: true },
  { symbol: "USDT", keys: ["usdt-tron", "usdt-eth", "usdt-sol"], always: false },
  { symbol: "ETH", keys: ["eth", "eth-base"], always: false },
  { symbol: "BTC", keys: ["btc"], always: false },
  { symbol: "NEAR", keys: ["near"], always: false },
];

function Balance({ data, error }: { data: HomeData | null; error: string | null }) {
  const { fmt } = useFiat();
  const [hidden, toggle] = useHideBalance();
  const b = data?.balances;
  const total = b ? b.totalUsd : null;
  const zec = b?.coins.find((c) => c.key === "zec");
  const boxes = ASSET_BOXES.map((box) => {
    const held = (b?.coins ?? []).filter((c) => box.keys.includes(c.key));
    const amount = held.reduce((s, c) => s + Number(c.amount), 0);
    return {
      ...box,
      amount,
      usd: held.reduce((s, c) => s + (c.usd ?? 0), 0),
      // the chain holding most of it, so Swap / Add money open on the right coin
      key: held.sort((x, y) => Number(y.amount) - Number(x.amount))[0]?.key ?? box.keys[0],
    };
  }).filter((box) => box.always || box.amount > 0);

  return (
    <section aria-labelledby="balance-heading" className="flex flex-col gap-4">
      <article className="glass-card flex min-h-[210px] flex-col justify-between p-5">
        <span aria-hidden="true" className="pointer-events-none absolute top-[58px] right-[-8px] text-[88px] leading-none font-semibold tracking-[-0.06em] text-white/22 select-none">
          zorro
        </span>
        <div className="relative flex items-center justify-between">
          <h2 id="balance-heading" className="rounded-full bg-white/55 px-3 py-1 text-xs font-semibold">
            Main wallet (ZEC)
          </h2>
          <button type="button" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} className="grid h-9 w-9 place-items-center rounded-full bg-white/40 hover:bg-white/60">
            {hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        </div>
        <div className="relative">
          <p className="text-[40px] leading-tight font-semibold">
            {total === null ? <span className="inline-block h-10 w-44 animate-pulse rounded-xl bg-white/40 align-middle" /> : <BigFiat value={total} hidden={hidden} dim="text-brand-ink/45" />}
          </p>
          {error && !b && <p className="mt-1 text-sm text-down">{error}</p>}
          <p className="tabular mt-1 text-sm font-medium text-brand-ink/70">
            {zec && !hidden ? `${Number(zec.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} ZEC` : "US Dollar"}
            {b?.zecUsd ? ` · 1 ZEC = ${fmt(b.zecUsd)}` : ""}
          </p>
        </div>
      </article>

      <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1" aria-label="Balances by asset">
        {boxes.map((box) => (
          <Link
            key={box.symbol}
            href={box.amount > 0 ? `/wallet/swap?from=${box.key}` : `/wallet/receive?coin=${box.key}`}
            className="glass-card-dark flex h-[124px] w-[150px] shrink-0 snap-start flex-col justify-between p-4 transition-transform hover:-translate-y-0.5"
          >
            <span className="flex items-center gap-2">
              <CoinBadge coinKey={box.keys[0]} size={28} showChain={false} />
              <span className="text-[13px] font-semibold">{box.symbol}</span>
              <span className="ml-auto text-[10px] text-snow/45">{box.amount > 0 ? "Swap" : "Add"}</span>
            </span>
            <span>
              <span className="tabular block truncate text-[19px] leading-tight font-semibold tracking-[-0.02em]">
                {!b ? "…" : hidden ? "••••" : fmt(box.usd)}
              </span>
              <span className="tabular mt-0.5 block truncate text-[11px] text-snow/55">
                {!b ? "" : hidden ? "••••" : `${box.amount.toLocaleString("en-US", { maximumFractionDigits: box.symbol === "BTC" ? 8 : 6 })} ${box.symbol}`}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
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
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/12 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-ink">
                <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
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
          Transactions
        </h2>
        <Link href="/tracker" className="flex items-center gap-1 text-sm text-brand hover:text-brand-light">
          See all <ArrowUpRight size={14} aria-hidden="true" />
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
          <Link href="/wallet/receive" className="text-brand">
            Add ZEC
          </Link>{" "}
          and make your first payment.
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((p, i) => (
            <li key={p.id}>
              <PaymentRow p={p} highlight={i === 0} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PaymentRow({ p, highlight = false }: { p: PaymentView; highlight?: boolean }) {
  const { fmt } = useFiat();
  const now = useNow();
  const c = findCoin(p.coinKey);
  const out = p.direction === "out";
  const kindLabel = { pay: "Payment", transfer: "Zorro transfer", autopay: "Autopay", request: "Payment link", deposit: "Added", swap: "Swap" }[p.kind] ?? p.kind;
  return (
    <Link
      href={`/pay/${p.id}`}
      className={`flex items-center gap-3 rounded-[22px] border border-white/6 p-3.5 transition-colors ${
        highlight ? "glass bg-gradient-to-r from-[#24402a]/90 to-[#3f6b34]/80" : "glass hover:bg-white/[0.08]"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${out ? "border border-white/25 text-snow/80" : "bg-brand text-brand-ink"}`}
        aria-hidden="true"
      >
        {out ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[15px] font-medium">{p.counterparty}</strong>
        <span className="block truncate text-xs text-snow/55">
          {when(p.createdAt, now)} · {p.status === "done" ? kindLabel : p.status === "failed" ? "Failed" : "In progress"}
        </span>
      </span>
      <span className="text-right">
        <strong className={`tabular block text-[15px] font-semibold ${p.status === "failed" ? "text-dim line-through" : out ? "" : "text-brand"}`}>
          {out ? "−" : "+"}
          {fmt(p.usd)}
        </strong>
        <span className="tabular block text-xs text-snow/55">
          {Number(p.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} {c?.symbol}
        </span>
      </span>
    </Link>
  );
}

function CreateWalletCard({ pending }: { pending: boolean }) {
  return (
    <section className="glass-card p-6">
      <p className="text-sm font-medium text-brand-ink/70">Step 2 of 2</p>
      <h2 className="mt-2 text-2xl leading-tight font-semibold tracking-[-0.03em]">Create your private Zorro wallet</h2>
      <p className="mt-2 text-sm leading-relaxed text-brand-ink/80">
        One Face ID. Hold ZEC, pay anyone in the coin they want, and set up Autopay. Zorro can only pay people you approve, up to your daily limit.
      </p>
      <Link href="/wallet/setup" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-brand">
        {pending ? "Finish setting up" : "Create wallet"}
      </Link>
    </section>
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
