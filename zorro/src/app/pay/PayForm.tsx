"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, Info, Send } from "lucide-react";
import { api } from "@/lib/api-client";
import { useCurrency } from "@/lib/client-prefs";
import { coin, displayAmount } from "@/lib/coins";
import type { PaymentQuote } from "@/lib/payments";
import type { PayeeView } from "@/lib/payees";
import { coinName, useFiat } from "@/components/money";
import { ErrorBox, Segmented } from "@/components/ui";

type Quote = Omit<PaymentQuote, "plan">;
type Currency = "COIN" | "INR" | "USD";

export function PayForm({ payee, initialAmount, initialCurrency }: { payee: PayeeView; initialAmount: string; initialCurrency: string | null }) {
  const router = useRouter();
  const [pref] = useCurrency();
  const { fmt } = useFiat();
  const c = coin(payee.coinKey);
  const [amount, setAmount] = useState(initialAmount);
  const [currency, setCurrency] = useState<Currency>(initialCurrency === "COIN" || initialCurrency === "USD" || initialCurrency === "INR" ? initialCurrency : pref);
  const [fundWith, setFundWith] = useState<"zec" | "coin">("zec");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<{ key: string; value: Quote } | null>(null);
  const [quoteError, setQuoteError] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;
  const input = { payeeId: payee.id, amount, currency, fundWith, note: note.trim() || undefined };
  const key = JSON.stringify({ ...input, note: undefined });

  // Re-quote (debounced) whenever the amount or options change.
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<Quote>("/api/pay/quote", JSON.parse(key))
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

  const q = quote?.key === key ? quote.value : null;
  const qError = quoteError?.key === key ? quoteError.message : null;
  const loading = valid && !q && !qError;

  async function pay() {
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/payments", input);
      router.push(`/pay/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment couldn't start");
      setBusy(false);
    }
  }

  const symbol = currency === "COIN" ? c.symbol : currency === "INR" ? "₹" : "$";
  return (
    <div className="flex flex-col gap-5">
      <section className="panel-hero p-5">
        <label className="block">
          <span className="text-sm text-snow/70">Amount</span>
          <span className="mt-1 flex items-baseline gap-2">
            {currency !== "COIN" && <span className="text-[40px] font-semibold text-snow/50">{symbol}</span>}
            <input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
              placeholder="0"
              aria-label="Amount"
              className="tabular w-full min-w-0 bg-transparent text-[44px] leading-tight font-semibold tracking-[-0.04em] caret-zec outline-none placeholder:text-snow/25 focus-visible:outline-none"
            />
            {currency === "COIN" && <span className="text-xl font-semibold text-snow/60">{c.symbol}</span>}
          </span>
        </label>
        <div className="mt-4">
          <Segmented
            label="Amount is in"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "INR", label: "₹ INR" },
              { value: "USD", label: "$ USD" },
              { value: "COIN", label: c.symbol },
            ]}
          />
        </div>
      </section>

      {c.key !== "zec" && (
        <div>
          <p className="mb-2 text-sm font-medium">Pay with</p>
          <Segmented
            label="Pay with"
            value={fundWith}
            onChange={setFundWith}
            options={[
              { value: "zec", label: "ZEC (convert now)" },
              { value: "coin", label: `My ${c.symbol} balance` },
            ]}
          />
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Note <span className="font-normal text-muted">· only you see it</span>
        </span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. November rent" className="field text-sm" />
      </label>

      {valid && (
        <section className="panel p-5" aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-5 w-40 animate-pulse rounded bg-white/8" />
              <div className="h-5 w-56 animate-pulse rounded bg-white/8" />
              <p className="text-xs text-muted">Getting a live quote from NEAR Intents…</p>
            </div>
          ) : qError ? (
            <ErrorBox message={qError} />
          ) : q ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">You pay</span>
                <strong className="tabular text-lg font-semibold">
                  {displayAmount(q.fundAmount)} {coin(q.fundCoinKey).symbol}
                </strong>
              </div>
              <div className="my-2 flex justify-center text-dim">
                <ArrowDown size={16} aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{payee.name} gets</span>
                <strong className="tabular text-lg font-semibold text-zec">
                  {displayAmount(q.amount)} {c.symbol}
                </strong>
              </div>
              <dl className="tabular mt-4 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Value</dt>
                  <dd>{fmt(q.usd, q.inr)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Fees (conversion + network)</dt>
                  <dd>{q.feeUsd === null ? "Shown after" : `≈ ${fmt(q.feeUsd, q.feeUsd * (q.inr / Math.max(q.usd, 1e-9)))}`}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Arrives as</dt>
                  <dd>{coinName(c)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Route</dt>
                  <dd>{payee.kind === "zorro" ? "Zorro → Zorro, instant" : q.fundCoinKey === q.coinKey ? "Send" : "Convert, then send"}</dd>
                </div>
              </dl>
              {q.fundCoinKey !== q.coinKey && (
                <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Zorro converts slightly more ZEC than needed so {payee.name} gets the exact amount. Any small extra stays in your wallet as {c.symbol}.
                </p>
              )}
              {q.notes.map((n) => (
                <p key={n} className="mt-2 text-xs text-gold">
                  {n}
                </p>
              ))}
              {q.problems.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {q.problems.map((p) => (
                    <ErrorBox key={p} message={p} />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>
      )}

      {error && <ErrorBox message={error} />}
      <button type="button" onClick={pay} disabled={!q || q.problems.length > 0 || busy} className="btn-primary w-full">
        <Send size={17} aria-hidden="true" />
        {busy ? "Starting…" : q ? `Pay ${fmt(q.usd, q.inr)}` : "Pay"}
      </button>
      <p className="text-center text-xs text-dim">Payments can&apos;t be reversed. Within your daily limit, no extra Face ID is needed.</p>
    </div>
  );
}
