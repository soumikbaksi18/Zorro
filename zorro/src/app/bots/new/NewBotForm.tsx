"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { BotConfigSchema, MIN_ZEC_TRADE, describeBot, type BotKind } from "@/lib/bots/config";
import { Segmented } from "@/components/ui";
import { PasskeyGate } from "@/components/bots/PasskeyGate";
import Link from "next/link";

const KINDS: { value: BotKind; label: string }[] = [
  { value: "stop_loss", label: "Stop-loss" },
  { value: "trailing_stop", label: "Trailing" },
  { value: "smart_dca", label: "Smart DCA" },
];
const STABLES = [
  { value: "usdc-base" as const, label: "USDC · Base" },
  { value: "usdc-sol" as const, label: "USDC · Solana" },
];
const EVERY = [
  { value: "24", label: "Daily" },
  { value: "168", label: "Weekly" },
  { value: "720", label: "Monthly" },
];

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const readHash = () => window.location.hash.slice(1);

export function NewBotForm() {
  const router = useRouter();
  const account = useAccount();
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const [kindInput, setKindInput] = useState<BotKind | null>(null);
  const kind: BotKind = kindInput ?? (KINDS.some((k) => k.value === hash) ? (hash as BotKind) : "stop_loss");

  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [amountZec, setAmountZec] = useState("0.01");
  const [trigger, setTrigger] = useState("");
  const [trailPct, setTrailPct] = useState("10");
  const [stable, setStable] = useState<"usdc-base" | "usdc-sol">("usdc-base");
  const [buyUsd, setBuyUsd] = useState("10");
  const [every, setEvery] = useState("168");
  const [dipBoost, setDipBoost] = useState("50");
  const [maxBuys, setMaxBuys] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ zecUsd: number }>("/api/price")
      .then((s) => setPrice(s.zecUsd))
      .catch(() => {});
  }, []);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status === "error") return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account.</p>;
  if (!account.me.user) return <PasskeyGate title="Sign in to create a bot" />;
  if (account.me.agent?.status !== "ACTIVE") {
    return (
      <div className="panel p-5 text-sm">
        Bots trade from your bot wallet.{" "}
        <Link href="/bots/setup" className="text-fox-light">
          Create it first
        </Link>
        .
      </div>
    );
  }

  const base = { mode, slippageBps: 100 };
  const raw =
    kind === "stop_loss"
      ? { ...base, kind, amountZec, triggerPriceUsd: Number(trigger), sellTo: stable }
      : kind === "trailing_stop"
        ? { ...base, kind, amountZec, trailPct: Number(trailPct), sellTo: stable }
        : {
            ...base,
            kind,
            buyUsd: Number(buyUsd),
            everyHours: Number(every),
            payWith: stable,
            dipBoostPct: Number(dipBoost),
            dipThresholdPct: 10,
            maxBuys: maxBuys ? Number(maxBuys) : null,
          };
  const parsed = BotConfigSchema.safeParse(raw);
  const triggerAbove = kind === "stop_loss" && price !== null && Number(trigger) >= price;

  async function create() {
    if (!parsed.success) return;
    setBusy(true);
    setError(null);
    try {
      const bot = await api<{ id: string }>("/api/bots", { config: parsed.data });
      router.push(`/bots/${bot.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the bot");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Strategy">
        <Segmented label="Strategy" value={kind} onChange={(k) => setKindInput(k)} options={KINDS} />
      </Field>

      <Field label="Mode">
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "paper", label: "Paper" },
            { value: "live", label: "Live" },
          ]}
        />
        <p className="mt-1.5 px-1 text-xs leading-relaxed text-muted">
          {mode === "paper"
            ? "Paper: uses real NEAR Intents quotes and logs what it would do. Never moves money."
            : "Live: trades your bot wallet's funds through NEAR Intents, within your signed limits."}
        </p>
      </Field>

      {price !== null && (
        <p className="tabular rounded-xl border border-line bg-panel px-3 py-2.5 text-sm">
          ZEC now: <span className="font-medium">${price.toFixed(2)}</span>
        </p>
      )}

      {kind !== "smart_dca" ? (
        <>
          <Input label="ZEC to sell" value={amountZec} onChange={setAmountZec} suffix="ZEC" hint={`Minimum ${MIN_ZEC_TRADE} ZEC`} />
          {kind === "stop_loss" ? (
            <Input
              label="Sell if ZEC falls to"
              value={trigger}
              onChange={setTrigger}
              prefix="$"
              hint={triggerAbove ? "That's at or above today's price: the bot would sell straight away." : price ? `e.g. ${(price * 0.9).toFixed(0)} (10% below now)` : undefined}
              warn={triggerAbove}
            />
          ) : (
            <Input label="Sell after a drop from the peak of" value={trailPct} onChange={setTrailPct} suffix="%" hint="Between 1% and 50%" />
          )}
          <Field label="Receive">
            <Segmented label="Receive" value={stable} onChange={setStable} options={STABLES} />
          </Field>
        </>
      ) : (
        <>
          <Input label="Buy each time" value={buyUsd} onChange={setBuyUsd} prefix="$" hint="Minimum $1. Fees are fixed per trade, so very small buys cost more." />
          <Field label="How often">
            <Segmented label="How often" value={every} onChange={setEvery} options={EVERY} />
          </Field>
          <Input label="Buy more on dips (10%+ below your average)" value={dipBoost} onChange={setDipBoost} suffix="% extra" hint="0 to turn it off" />
          <Input label="Stop after (optional)" value={maxBuys} onChange={setMaxBuys} suffix="buys" />
          <Field label="Pay with">
            <Segmented label="Pay with" value={stable} onChange={setStable} options={STABLES} />
          </Field>
        </>
      )}

      {parsed.success ? (
        <section className="panel-hero p-4">
          <p className="eyebrow">This bot will</p>
          <p className="mt-2 text-sm leading-relaxed">{describeBot(parsed.data)}.</p>
          <p className="mt-2 text-xs text-muted">Up to 1% price slippage. Live trades also stay within your daily budget.</p>
        </section>
      ) : (
        <p className="text-xs text-muted">
          {kind === "stop_loss" && !trigger ? "Enter the ZEC price that should trigger the sale." : parsed.error.issues[0]?.message}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
          {error}
        </p>
      )}
      <button type="button" onClick={create} disabled={!parsed.success || busy} className="btn-primary w-full">
        {busy ? "Starting…" : mode === "paper" ? "Start paper bot" : "Start live bot"}
      </button>
    </div>
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

function Input(props: { label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; hint?: string; warn?: boolean }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block px-1">{props.label}</span>
      <span className="field flex items-center gap-2 focus-within:border-fox-light">
        {props.prefix && <span className="text-muted">{props.prefix}</span>}
        <input
          inputMode="decimal"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
          className="tabular w-full min-w-0 bg-transparent py-3 text-sm outline-none"
        />
        {props.suffix && <span className="shrink-0 text-sm text-muted">{props.suffix}</span>}
      </span>
      {props.hint && <span className={`mt-1 block px-1 text-xs ${props.warn ? "text-gold" : "text-muted"}`}>{props.hint}</span>}
    </label>
  );
}
