"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { COINS, coin, displayAmount, findCoin } from "@/lib/coins";
import type { ConvertQuote } from "@/lib/payments";
import type { WalletBalances } from "@/lib/wallet-service";
import { Dropdown } from "@/components/Dropdown";
import { SlideToConfirm } from "@/components/SlideToConfirm";
import { CoinBadge, useFiat } from "@/components/money";
import { ErrorBox } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

type Quote = Omit<ConvertQuote, "plan">;

const COIN_OPTIONS = COINS.map((c) => ({
  value: c.key as string,
  label: c.symbol,
  hint: c.kind === "zec" || c.symbol.toUpperCase() === c.chainName.toUpperCase() ? undefined : c.chainName,
  icon: <CoinBadge coinKey={c.key} size={20} showChain={false} />,
}));

/** Swap inside the wallet: you swap → you get, then slide to swap. */
export function SwapFlow() {
  const account = useAccount();
  const router = useRouter();
  const params = useSearchParams();
  const { fmt } = useFiat();
  const initialFrom = findCoin(params.get("from") ?? "")?.key ?? "zec";
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(findCoin(params.get("to") ?? "")?.key ?? (initialFrom === "zec" ? "usdc-base" : "zec"));
  const [amount, setAmount] = useState(/^\d+(\.\d+)?$/.test(params.get("amount") ?? "") ? (params.get("amount") as string) : "");
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [quote, setQuote] = useState<{ key: string; value: Quote } | null>(null);
  const [quoteError, setQuoteError] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  useEffect(() => {
    if (!hasWallet) return;
    api<WalletBalances>("/api/agent/balances")
      .then(setBalances)
      .catch(() => {});
  }, [hasWallet]);

  const valid = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0 && from !== to;
  const key = JSON.stringify({ from, to, amount, amountIn: "COIN" });
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<Quote>("/api/wallet/swap/quote", JSON.parse(key))
        .then((q) => {
          if (cancelled) return;
          setQuote({ key, value: q });
          setQuoteError(null);
        })
        .catch((e: Error) => !cancelled && setQuoteError({ key, message: e.message }));
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, valid]);

  if (account.status === "loading") return <div className="panel h-72 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to swap" />;
  if (!hasWallet) {
    return (
      <div className="panel p-5 text-sm">
        Create your wallet first.{" "}
        <Link href="/wallet/setup" className="text-brand">
          Create wallet
        </Link>
      </div>
    );
  }

  const q = quote?.key === key ? quote.value : null;
  const qError = quoteError?.key === key ? quoteError.message : null;
  const loading = valid && !q && !qError;
  const f = coin(from);
  const t = coin(to);
  const have = balances?.coins.find((c) => c.key === from)?.amount ?? "0";
  const inrPerUsd = q && q.usd > 0 ? q.inr / q.usd : null;

  function flip() {
    setFrom(to);
    setTo(from);
    setAmount("");
  }
  async function swap() {
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/wallet/swap", { from, to, amount, amountIn: "COIN" });
      router.push(`/pay/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The swap couldn't start");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="sheet-light p-4" aria-label="Swap">
        <div className="sheet-box p-4">
          <div className="flex items-center justify-between text-[13px] font-medium text-brand-ink/70">
            <label htmlFor="swap-amount">You swap</label>
            <button type="button" onClick={() => setAmount(have)} className="rounded-full bg-brand-ink/6 px-2.5 py-0.5 text-[12px] font-semibold text-brand-ink/75 hover:bg-brand-ink/12">
              Balance {displayAmount(have)} · Max
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="swap-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
              placeholder="0"
              className="tabular w-full min-w-0 bg-transparent text-[32px] leading-tight font-semibold tracking-[-0.03em] text-brand-ink caret-brand-dark outline-none placeholder:text-brand-ink/25 focus-visible:outline-none"
            />
            <Dropdown label="Swap from" variant="light" value={from} onChange={(v) => (v === to ? flip() : setFrom(v))} options={COIN_OPTIONS} className="w-[132px] shrink-0" />
          </div>
          <p className="tabular mt-1 text-xs font-medium text-brand-ink/55">{q ? fmt(q.usd, q.inr) : " "}</p>
        </div>

        <div className="relative z-10 -my-3 flex justify-center">
          <button type="button" onClick={flip} aria-label="Swap direction" className="sheet-flip transition-transform duration-300 hover:rotate-180">
            <ArrowDownUp size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="sheet-box sheet-box-tint p-4" aria-live="polite" aria-busy={loading}>
          <p className="text-[13px] font-medium text-brand-ink/70">You get</p>
          <div className="mt-2 flex items-center gap-2">
            <p className={`tabular w-full min-w-0 truncate text-[32px] leading-tight font-semibold tracking-[-0.03em] ${q ? "text-[#1f5a26]" : "text-brand-ink/25"}`}>{q ? displayAmount(q.toAmount) : loading ? "…" : "0"}</p>
            <Dropdown label="Swap to" variant="light" value={to} onChange={(v) => (v === from ? flip() : setTo(v))} options={COIN_OPTIONS} className="w-[132px] shrink-0" />
          </div>
          <dl className="tabular mt-4 space-y-2.5 border-t border-dashed border-brand-ink/15 pt-3.5 text-[13px]">
            <Row label="Rate">{q ? `1 ${f.symbol} = ${displayAmount(q.rate)} ${t.symbol}` : "—"}</Row>
            <Row label="Fee">{q ? (q.feeUsd === null ? "Included" : `≈ ${fmt(q.feeUsd, inrPerUsd ? q.feeUsd * inrPerUsd : null)}`) : "—"}</Row>
            <Row label="You get at least">{q ? `${displayAmount(q.minToAmount)} ${t.symbol}` : "—"}</Row>
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5 px-0.5 text-[11.5px] font-semibold text-brand-ink/75">
          <span className="sheet-pill rounded-full px-2.5 py-1">Stays in your wallet</span>
          <span className="sheet-pill rounded-full px-2.5 py-1">~1 min</span>
          <span className="sheet-pill rounded-full px-2.5 py-1">via NEAR Intents</span>
        </div>
      </section>

      {qError && <ErrorBox message={qError} />}
      {q?.problems.map((p) => (
        <ErrorBox key={p} message={p} />
      ))}
      {error && <ErrorBox message={error} />}

      <SlideToConfirm
        label={q ? `Slide to swap ${displayAmount(q.fromAmount)} ${f.symbol}` : "Slide to swap"}
        busyLabel={busy ? "Starting…" : null}
        disabled={!q || q.problems.length > 0}
        onConfirm={swap}
      />
      <p className="text-center text-xs text-dim">If the price moves more than 1% before it settles, the swap is refunded instead.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-ink/55">{label}</dt>
      <dd className="text-right font-semibold text-brand-ink">{children}</dd>
    </div>
  );
}
