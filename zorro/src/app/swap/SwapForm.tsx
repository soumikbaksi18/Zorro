"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Globe, Lock, Link2 } from "lucide-react";
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
  const [consent, setConsent] = useState(false);
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
  const canReview = amountNum > 0 && recipientOk && refundOk && consent && !busy;

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
  const privacy = <PrivacyPanel direction={direction} chainName={coin.chainName} />;

  return (
    <div className="flex flex-col gap-5">
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

        <div className="panel p-4 focus-within:border-fox-light">
          <p className="eyebrow">You send{origin === ZEC ? "" : ` · ${origin.chainName}`}</p>
          <div className="mt-1 flex items-center gap-3">
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => edit(setAmount)(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
              className="tabular w-full min-w-0 bg-transparent py-2 text-[34px] font-light tracking-[-0.03em] outline-none placeholder:text-dim"
              aria-label={`Amount of ${origin.symbol} to send`}
            />
            <span className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium">
              {origin.symbol}
            </span>
          </div>
          <p className="tabular text-xs text-muted">
            {[
              fiatValue !== null && `≈ ${formatFiat(fiatValue, currency)}`,
              estimateOut !== null && `you get about ${estimateOut.toFixed(direction === "sell" ? 2 : 5)} ${destination.symbol}`,
              direction === "sell" && `min ${MIN_ZEC} ZEC`,
            ]
              .filter(Boolean)
              .join(" · ") || " "}
          </p>
        </div>

        <AddressField
          label={`Receive ${destination.symbol} at · ${destination.chainName} address`}
          value={recipient}
          onChange={edit(setRecipientInput)}
          ok={recipientOk}
          placeholder={destination.chain === "zec" ? "u1… or t1… address" : destination.chain === "base" ? "0x…" : "Solana address"}
        />
        <AddressField
          label={`Refund to, if the swap can't complete · ${origin.chainName} address`}
          value={refundTo}
          onChange={edit(setRefundInput)}
          ok={refundOk}
          placeholder={origin.chain === "zec" ? "u1… or t1… address" : origin.chain === "base" ? "0x…" : "Solana address"}
        />
        {transparentWarning && (
          <p className="-mt-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold">
            That&apos;s a transparent Zcash address (t…): anything sent there is public.
          </p>
        )}

        <Field label="Max price slippage">
          <Segmented label="Slippage" value={slippage} onChange={edit(setSlippage)} options={SLIPPAGE_OPTIONS} />
        </Field>

        {privacy}

        <label className="flex items-start gap-3 text-xs leading-relaxed text-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-fox)]"
          />
          <span>
            Share this swap&apos;s amount and addresses with <span className="text-snow">NEAR Intents</span> to get a
            quote. Nothing moves until you send the deposit yourself.
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
            {error}
          </p>
        )}

        {review ? (
          <ReviewCard quote={review} onConfirm={onConfirm} confirming={busy === "confirm"} />
        ) : (
          <button type="button" onClick={onReview} disabled={!canReview} className="btn-primary w-full">
            {busy === "review" ? "Getting quote…" : "Review swap"}
          </button>
        )}

        <p className="text-xs leading-relaxed text-dim">
          Quotes come from NEAR Intents solvers. If the price moves more than your slippage before your deposit
          lands, NEAR Intents refunds you automatically.
        </p>
    </div>
  );
}

function PrivacyPanel({ direction, chainName }: { direction: Direction; chainName: string }) {
  const rows =
    direction === "sell"
      ? [
          {
            icon: Eye,
            title: "Zcash",
            body: "Your deposit goes to a transparent NEAR Intents address, so its amount and time are public. Your wallet's other funds stay shielded.",
          },
          {
            icon: Globe,
            title: "NEAR Intents",
            body: "Sees the amount, both addresses and the timing. Your refund address is recorded publicly on NEAR.",
          },
          { icon: Link2, title: chainName, body: `The USDC you receive is a normal public transfer on ${chainName}.` },
        ]
      : [
          { icon: Link2, title: chainName, body: `Your USDC deposit is a normal public transfer on ${chainName}.` },
          {
            icon: Globe,
            title: "NEAR Intents",
            body: "Sees the amount, both addresses and the timing. Your refund address is recorded publicly on NEAR.",
          },
          {
            icon: Eye,
            title: "Zcash",
            body: "NEAR Intents' docs list Zcash as transparent addresses only, so treat the ZEC delivery as public. Shield it in your wallet afterwards.",
          },
        ];

  return (
    <section className="panel p-5" aria-labelledby="privacy-heading">
      <p className="eyebrow">Privacy review</p>
      <h2 id="privacy-heading" className="mt-3 text-xl font-light tracking-[-0.02em]">
        What others can see
      </h2>
      <div className="mt-4">
        {rows.map(({ icon: Icon, title, body }) => (
          <div key={title} className="visibility-row">
            <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          </div>
        ))}
        <div className="visibility-row">
          <Lock size={16} strokeWidth={1.6} className="!text-leaf" aria-hidden="true" />
          <div>
            <strong>Zorro</strong>
            <p>Forwards your quote request and keeps the swap only on this phone. We never see your keys.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-2 px-1">{label}</p>
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
      <span className="eyebrow mb-2 block px-1">{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.trim())}
        placeholder={props.placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={showError}
        className="field font-mono text-sm placeholder:font-sans placeholder:text-dim"
      />
      {showError && (
        <span className="mt-1 block px-1 text-xs text-down">That address doesn&apos;t look right for this network.</span>
      )}
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
    <section ref={ref} className="panel-hero scroll-mb-24 p-5" aria-label="Quote">
      <p className="eyebrow">Quote · NEAR Intents</p>
      <p className="tabular mt-3 text-[30px] leading-none font-light tracking-[-0.02em]">
        {quote.receive.amount} <span className="text-base text-muted">{quote.receive.symbol}</span>
      </p>
      <p className="mt-1.5 text-xs text-muted">Estimated amount you receive on {quote.receive.chainName}</p>
      <dl className="tabular mt-4 text-sm">
        <Row label="You send" value={`${quote.send.amount} ${quote.send.symbol}`} />
        <Row label="Guaranteed minimum" value={`${quote.receive.minAmount} ${quote.receive.symbol}`} />
        <Row label="Route" value={`${quote.send.chainName} → ${quote.receive.chainName}`} />
        <Row label="Takes about" value={`${minutes} min after your deposit`} />
      </dl>
      <button type="button" onClick={onConfirm} disabled={confirming} className="btn-primary mt-5 w-full">
        {confirming ? "Creating deposit address…" : "Confirm & get deposit address"}
      </button>
      <p className="mt-2 text-center text-xs text-muted">Nothing moves until you send the deposit from your wallet.</p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-snow/90">{value}</dd>
    </div>
  );
}
