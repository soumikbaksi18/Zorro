"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { BotConfigSchema, MIN_LIMIT_ZEC, MIN_ZEC_TRADE, describeBot, gridPrices, ladderPrices, type BotKind } from "@/lib/bots/config";
import { Segmented } from "@/components/ui";
import { PasskeyGate } from "@/components/bots/PasskeyGate";
import Link from "next/link";

const KINDS: { value: BotKind; label: string }[] = [
  { value: "stop_loss", label: "Stop-loss" },
  { value: "trailing_stop", label: "Trailing" },
  { value: "smart_dca", label: "Smart DCA" },
  { value: "tp_ladder", label: "Take-profit" },
  { value: "grid", label: "Grid" },
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
  // Take-profit ladder
  const [ladderZec, setLadderZec] = useState("0.01");
  const [firstPrice, setFirstPrice] = useState("");
  const [stepPct, setStepPct] = useState("10");
  const [rungs, setRungs] = useState("4");
  // Grid
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [levels, setLevels] = useState("5");
  const [gridZec, setGridZec] = useState("0.002");
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
        : kind === "smart_dca"
          ? {
              ...base,
              kind,
              buyUsd: Number(buyUsd),
              everyHours: Number(every),
              payWith: stable,
              dipBoostPct: Number(dipBoost),
              dipThresholdPct: 10,
              maxBuys: maxBuys ? Number(maxBuys) : null,
            }
          : kind === "tp_ladder"
            ? { kind, mode, amountZec: ladderZec, firstPriceUsd: Number(firstPrice), stepPct: Number(stepPct), rungs: Number(rungs), receive: stable }
            : { kind, mode, lowerUsd: Number(lower), upperUsd: Number(upper), levels: Number(levels), orderZec: gridZec, quote: stable };
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
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Strategy">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKindInput(k.value)}
              aria-pressed={kind === k.value}
              className={`min-h-10 rounded-full border text-[13px] font-medium transition-colors ${
                kind === k.value ? "border-fox bg-fox text-snow" : "border-line bg-panel text-muted hover:text-snow"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
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

      {kind === "tp_ladder" ? (
        <>
          <Input label="ZEC to sell in total" value={ladderZec} onChange={setLadderZec} suffix="ZEC" hint={`At least ${MIN_LIMIT_ZEC} ZEC per rung`} />
          <Input
            label="First rung price"
            value={firstPrice}
            onChange={setFirstPrice}
            prefix="$"
            hint={price ? `e.g. ${(price * 1.1).toFixed(0)} (10% above now). Rungs below today's price sell straight away.` : undefined}
          />
          <Input label="Each rung higher by" value={stepPct} onChange={setStepPct} suffix="%" />
          <Input label="Rungs" value={rungs} onChange={setRungs} suffix="of 1–6" />
          <Field label="Receive">
            <Segmented label="Receive" value={stable} onChange={setStable} options={STABLES} />
          </Field>
        </>
      ) : kind === "grid" ? (
        <>
          <Input label="Range from" value={lower} onChange={setLower} prefix="$" hint={price ? `e.g. ${(price * 0.9).toFixed(0)}` : undefined} />
          <Input label="Range to" value={upper} onChange={setUpper} prefix="$" hint={price ? `e.g. ${(price * 1.1).toFixed(0)}` : undefined} />
          <Input label="Levels" value={levels} onChange={setLevels} suffix="of 3–10" />
          <Input label="ZEC per level" value={gridZec} onChange={setGridZec} suffix="ZEC" hint={`At least ${MIN_LIMIT_ZEC} ZEC`} />
          <Field label="Trade against">
            <Segmented label="Trade against" value={stable} onChange={setStable} options={STABLES} />
          </Field>
          <p className="rounded-xl border border-line bg-panel px-3 py-2.5 text-xs leading-relaxed text-muted">
            A grid needs both ZEC (for the sells above the price) and USDC (for the buys below). Each order placed counts
            towards your daily budget.
          </p>
        </>
      ) : kind !== "smart_dca" ? (
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
          {parsed.data.kind === "tp_ladder" && (
            <p className="tabular mt-2 text-xs text-muted">Rungs: {ladderPrices(parsed.data).map((p) => `$${p}`).join(" · ")}</p>
          )}
          {parsed.data.kind === "grid" && (
            <p className="tabular mt-2 text-xs text-muted">
              Levels: {gridPrices(parsed.data).map((p) => `$${p}`).join(" · ")}. Each buy→sell round trip earns about $
              {(((parsed.data.upperUsd - parsed.data.lowerUsd) / (parsed.data.levels - 1)) * Number(parsed.data.orderZec)).toFixed(2)} before fees (~0.2% per order).
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            {parsed.data.kind === "tp_ladder" || parsed.data.kind === "grid"
              ? "Uses NEAR Intents limit orders: they rest until the price is reached, for up to 7 days at a time (Zorro re-places them)."
              : "Up to 1% price slippage. Live trades also stay within your daily budget."}
          </p>
        </section>
      ) : (
        <p className="text-xs text-muted">
          {kind === "stop_loss" && !trigger
            ? "Enter the ZEC price that should trigger the sale."
            : kind === "tp_ladder" && !firstPrice
              ? "Enter the price of the first rung."
              : kind === "grid" && (!lower || !upper)
                ? "Enter the price range for the grid."
                : parsed.error.issues[0]?.message}
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
