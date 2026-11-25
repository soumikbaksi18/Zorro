"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_ZEC, STABLECOINS, ZEC, getStablecoin, type StablecoinKey } from "@/lib/assets";
import { isValidAddressForChain, zcashAddressKind } from "@/lib/addresses";
import type { SwapQuote } from "@/lib/swap";
import type { Spot } from "@/lib/prices";
import { useCurrency } from "@/lib/client-prefs";
import { formatFiat } from "@/lib/format";
import { rememberAddress, saveSwap, useSavedAddresses } from "@/lib/swap-store";
import { Segmented } from "@/components/ui";

type Direction = "sell" | "buy";

const SLIPPAGE_OPTIONS = [
  { value: "50", label: "0.5%" },
  { value: "100", label: "1%" },
  { value: "200", label: "2%" },
];

export function SwapForm() {
  const router = useRouter();
  const [currency] = useCurrency();
  const [direction, setDirection] = useState<Direction>("sell");
  const [stable, setStable] = useState<StablecoinKey>("usdc-base");
  const [amount, setAmount] = useState("");
  // null = not edited yet, so fall back to the address used last time on this chain
  const [recipientInput, setRecipientInput] = useState<string | null>(null);
  const [refundInput, setRefundInput] = useState<string | null>(null);
  const saved = useSavedAddresses();
  const [slippage, setSlippage] = useState("100");
  const [spot, setSpot] = useState<Spot | null>(null);
  const [review, setReview] = useState<SwapQuote | null>(null);
  const [busy, setBusy] = useState<"review" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const coin = getStablecoin(stable)!;
  const origin = direction === "sell" ? ZEC : coin;
  const destination = direction === "sell" ? coin : ZEC;
  const recipient = recipientInput ?? saved[destination.chain] ?? "";
  const refundTo = refundInput ?? saved[origin.chain] ?? "";

  // Changing direction or network changes which chains the addresses are on: start from saved ones again.
  const changeChains = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setRecipientInput(null);
    setRefundInput(null);
    setReview(null);
    setError(null);
  };

  useEffect(() => {
    fetch("/api/price")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSpot)
      .catch(() => {});
  }, []);

  // Any edit invalidates the reviewed quote.
  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setReview(null);
    setError(null);
  };

  const amountNum = Number(amount);
  const estimateOut =
    spot && amountNum > 0 ? (direction === "sell" ? amountNum * spot.zecUsd : amountNum / spot.zecUsd) : null;
  const usdValue = spot && amountNum > 0 ? (direction === "sell" ? amountNum * spot.zecUsd : amountNum) : null;
  const fiatValue = usdValue !== null && spot ? usdValue * (currency === "INR" ? spot.usdInr : 1) : null;

  const recipientOk = isValidAddressForChain(destination.chain, recipient);
  const refundOk = isValidAddressForChain(origin.chain, refundTo);
  const canReview = amountNum > 0 && recipientOk && refundOk && !busy;

  async function requestQuote(dry: boolean): Promise<SwapQuote | null> {
    const res = await fetch("/api/swap/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        direction,
        stable,
        amount: amount.trim(),
        recipient: recipient.trim(),
        refundTo: refundTo.trim(),
        slippageBps: Number(slippage),
        dry,
      }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected response" }));
    if (!res.ok) {
      setError(data.error ?? "Couldn't get a quote.");
      return null;
    }
    return data as SwapQuote;
  }

  async function onReview() {
    setBusy("review");
    setError(null);
    try {
      setReview(await requestQuote(true));
    } catch {
      setError("Couldn't reach Zorro. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function onConfirm() {
    setBusy("confirm");
    setError(null);
    try {
      const quote = await requestQuote(false);
      if (!quote?.depositAddress) return;
      rememberAddress(destination.chain, recipient);
      rememberAddress(origin.chain, refundTo);
      saveSwap({
        id: quote.depositAddress,
        createdAt: new Date().toISOString(),
        quote,
        recipient: recipient.trim(),
        refundTo: refundTo.trim(),
        status: "PENDING_DEPOSIT",
      });
      router.push(`/swap/${encodeURIComponent(quote.depositAddress)}`);
    } catch {
      setError("Couldn't reach Zorro. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  const zecAddressField = direction === "sell" ? refundTo : recipient;
  const transparentWarning = zcashAddressKind(zecAddressField) === "transparent";

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Swap direction"
        value={direction}
        onChange={changeChains(setDirection)}
        options={[
          { value: "sell", label: "Sell ZEC" },
          { value: "buy", label: "Buy ZEC" },
        ]}
      />

      <Field label={direction === "sell" ? "Receive USDC on" : "Pay with USDC on"}>
        <Segmented
          label="Stablecoin network"
          value={stable}
          onChange={changeChains(setStable)}
          options={STABLECOINS.map((s) => ({ value: s.key, label: s.chainName }))}
        />
      </Field>

      <Field label={`You send (${origin.symbol}${origin === ZEC ? "" : ` on ${origin.chainName}`})`}>
        <div className="flex items-center rounded-2xl border border-line bg-surface px-4 focus-within:border-fox">
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => edit(setAmount)(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
            className="tabular w-full bg-transparent py-4 text-2xl font-semibold outline-none placeholder:text-muted/50"
            aria-label={`Amount of ${origin.symbol} to send`}
          />
          <span className="text-muted">{origin.symbol}</span>
        </div>
        <p className="tabular mt-1.5 px-1 text-xs text-muted">
          {fiatValue !== null ? `≈ ${formatFiat(fiatValue, currency)}` : " "}
          {estimateOut !== null &&
            ` · you get about ${estimateOut.toFixed(direction === "sell" ? 2 : 5)} ${destination.symbol}`}
          {direction === "sell" && ` · minimum ${MIN_ZEC} ZEC`}
        </p>
      </Field>

      <AddressField
        label={`Receive ${destination.symbol} at (${destination.chainName} address)`}
        value={recipient}
        onChange={edit(setRecipientInput)}
        ok={recipientOk}
        placeholder={destination.chain === "zec" ? "u1… shielded address" : destination.chain === "base" ? "0x…" : "Solana address"}
      />
      <AddressField
        label={`Refund to, if the swap can't complete (${origin.chainName} address)`}
        value={refundTo}
        onChange={edit(setRefundInput)}
        ok={refundOk}
        placeholder={origin.chain === "zec" ? "u1… shielded address" : origin.chain === "base" ? "0x…" : "Solana address"}
      />
      {transparentWarning && (
        <p className="-mt-2 rounded-xl bg-gold/10 px-3 py-2 text-xs text-gold">
          That&apos;s a transparent Zcash address (t…). Use a shielded one (u1…) from Zodl to keep this private.
        </p>
      )}

      <Field label="Max price slippage">
        <Segmented label="Slippage" value={slippage} onChange={edit(setSlippage)} options={SLIPPAGE_OPTIONS} />
      </Field>

      {error && (
        <p role="alert" className="rounded-xl bg-down/10 px-3 py-2.5 text-sm text-down">
          {error}
        </p>
      )}

      {review ? (
        <ReviewCard quote={review} onConfirm={onConfirm} confirming={busy === "confirm"} />
      ) : (
        <button
          type="button"
          onClick={onReview}
          disabled={!canReview}
          className="rounded-2xl bg-fox py-4 font-semibold text-snow transition-opacity disabled:opacity-40"
        >
          {busy === "review" ? "Getting quote…" : "Review swap"}
        </button>
      )}

      <p className="px-2 text-center text-xs leading-relaxed text-muted">
        Quotes come from NEAR Intents solvers. If the price moves more than your slippage before your deposit lands,
        NEAR Intents refunds you automatically.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-sm text-muted">{label}</p>
      {children}
    </div>
  );
}

function AddressField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ok: boolean;
  placeholder: string;
}) {
  const showError = props.value.trim().length > 0 && !props.ok;
  return (
    <label className="block">
      <span className="mb-2 block px-1 text-sm text-muted">{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.trim())}
        placeholder={props.placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={showError}
        className={`w-full rounded-2xl border bg-surface px-4 py-3.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted/60 focus:border-fox ${
          showError ? "border-down" : "border-line"
        }`}
      />
      {showError && <span className="mt-1 block px-1 text-xs text-down">That address doesn&apos;t look right for this network.</span>}
    </label>
  );
}

function ReviewCard({ quote, onConfirm, confirming }: { quote: SwapQuote; onConfirm: () => void; confirming: boolean }) {
  const minutes = Math.max(1, Math.round(quote.timeEstimateSec / 60));
  // Bring the quote and its Confirm button fully into view (clear of the bottom nav).
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return (
    <section ref={ref} className="scroll-mb-24 rounded-2xl border border-fox/50 bg-fox/10 p-4" aria-label="Quote">
      <dl className="tabular space-y-2 text-sm">
        <Row label="You send" value={`${quote.send.amount} ${quote.send.symbol}`} />
        <Row label="You receive (estimate)" value={`${quote.receive.amount} ${quote.receive.symbol}`} strong />
        <Row label="Guaranteed minimum" value={`${quote.receive.minAmount} ${quote.receive.symbol}`} />
        <Row label="Network" value={`${quote.send.chainName} → ${quote.receive.chainName}`} />
        <Row label="Takes about" value={`${minutes} min after your deposit`} />
      </dl>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming}
        className="mt-4 w-full rounded-xl bg-fox py-3.5 font-semibold text-snow disabled:opacity-50"
      >
        {confirming ? "Creating deposit address…" : "Confirm & get deposit address"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">Nothing moves until you send the deposit from your wallet.</p>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold text-snow" : "text-snow/90"}>{value}</dd>
    </div>
  );
}
