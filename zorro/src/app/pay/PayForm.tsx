"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownUp, Info } from "lucide-react";
import { api } from "@/lib/api-client";
import { useCurrency } from "@/lib/client-prefs";
import { coin, displayAmount } from "@/lib/coins";
import type { PaymentQuote } from "@/lib/payments";
import type { PayeeView } from "@/lib/payees";
import { SlideToConfirm } from "@/components/SlideToConfirm";
import { coinName, useFiat } from "@/components/money";
import { ErrorBox, Segmented } from "@/components/ui";

type Quote = Omit<PaymentQuote, "plan">;
type Currency = "COIN" | "INR" | "USD";

/** "Sending money": what you send, what they get, fees and rate, then slide to pay. */
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
  const inrPerUsd = q && q.usd > 0 ? q.inr / q.usd : null;

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

  return (
    <div className="flex flex-col gap-5">
      <section className="sheet-light p-4" aria-label="Sending money">
        <div className="sheet-box p-4">
          <label htmlFor="pay-amount" className="text-[13px] font-medium text-brand-ink/70">
            You send
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="pay-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
              placeholder="0"
              aria-label="Amount"
              className="tabular w-full min-w-0 bg-transparent text-[30px] leading-tight font-semibold tracking-[-0.03em] caret-brand-dark outline-none placeholder:text-brand-ink/30 focus-visible:outline-none"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              aria-label="Currency of the amount"
              className="shrink-0 rounded-full bg-white/70 px-3 py-2 text-sm font-semibold text-brand-ink outline-none"
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="COIN">{c.symbol}</option>
            </select>
          </div>
        </div>

        <div className="my-2.5 flex justify-center">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-brand-ink/20 text-brand-ink/70" aria-hidden="true">
            <ArrowDownUp size={16} />
          </span>
        </div>

        <div className="sheet-box p-4 text-center" aria-live="polite" aria-busy={loading}>
          <p className="text-[13px] font-medium text-brand-ink/70">{payee.name} gets</p>
          <p className="tabular mt-1 text-[32px] leading-tight font-semibold tracking-[-0.03em]">
            {q ? displayAmount(q.amount) : loading ? "…" : "0"} <span className="text-lg">{c.symbol}</span>
          </p>
          <dl className="tabular mt-4 space-y-2 text-left text-[13px]">
            <Row label="You pay">{q ? `${displayAmount(q.fundAmount)} ${coin(q.fundCoinKey).symbol}` : "—"}</Row>
            <Row label="Value">{q ? fmt(q.usd, q.inr) : "—"}</Row>
            <Row label="Fee (convert + network)">{q ? (q.feeUsd === null ? "Shown after" : `≈ ${fmt(q.feeUsd, inrPerUsd ? q.feeUsd * inrPerUsd : null)}`) : "—"}</Row>
            <Row label="Rate">{q ? `1 ZEC = ${fmt(q.zecUsd, inrPerUsd ? q.zecUsd * inrPerUsd : null)}` : "—"}</Row>
          </dl>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 px-1 text-[12px] font-medium text-brand-ink/75">
          <span>Arrives as</span>
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-brand-ink">{coinName(c)}</span>
          <span className="ml-1">in</span>
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-brand-ink">{payee.kind === "zorro" ? "seconds" : "~1–3 min"}</span>
        </div>
      </section>

      {qError && <ErrorBox message={qError} />}
      {q?.problems.map((p) => (
        <ErrorBox key={p} message={p} />
      ))}
      {q?.notes.map((n) => (
        <p key={n} className="text-xs text-gold">
          {n}
        </p>
      ))}

      {c.key !== "zec" && (
        <div>
          <p className="mb-2 text-sm font-medium">Pay with</p>
          <Segmented
            label="Pay with"
            value={fundWith}
            onChange={setFundWith}
            options={[
              { value: "zec", label: "ZEC (convert now)" },
              { value: "coin", label: `My ${c.symbol}` },
            ]}
          />
          {fundWith === "zec" && (
            <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Zorro converts slightly more ZEC than needed so {payee.name} gets the exact amount; any small extra stays in your wallet as {c.symbol}.
            </p>
          )}
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Note <span className="font-normal text-muted">· only you see it</span>
        </span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. November rent" className="field text-sm" />
      </label>

      {error && <ErrorBox message={error} />}
      <SlideToConfirm
        label={q ? `Slide to pay ${fmt(q.usd, q.inr)}` : "Slide to pay"}
        busyLabel={busy ? "Starting…" : null}
        disabled={!q || q.problems.length > 0}
        onConfirm={pay}
      />
      <p className="text-center text-xs text-dim">Payments can&apos;t be reversed. Within your daily limit, no extra Face ID is needed.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-ink/65">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}
