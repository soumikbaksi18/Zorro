"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Fingerprint, ShieldCheck } from "lucide-react";
import { shortAddress, zcashAddressKind } from "@/lib/addresses";
import { prepareWallet, signAndCreateWallet, useAccount, type PolicyChoices } from "@/lib/account-client";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";
import { ErrorBox } from "@/components/ui";

const LIMITS = ["50", "100", "250"];

type Prepared = Awaited<ReturnType<typeof prepareWallet>>;
type Stage = { kind: "form" } | { kind: "review"; prepared: Prepared; choices: PolicyChoices } | { kind: "working"; step: string } | { kind: "done" };

export function SetupFlow() {
  const account = useAccount();
  const [limit, setLimit] = useState("100");
  const [custom, setCustom] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status === "error") return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account.</p>;
  if (!account.me.user) return <PasskeyGate />;
  if (account.me.agent && stage.kind !== "done") {
    return (
      <div className="panel p-5 text-sm">
        You already have a Zorro wallet.{" "}
        <Link href="/" className="text-brand">
          Go to Home
        </Link>
      </div>
    );
  }

  const dailyLimitUsd = limit === "custom" ? custom.trim() : limit;
  const limitOk = /^[1-9]\d{0,4}(\.\d{1,2})?$/.test(dailyLimitUsd);
  const cashKind = cashOut.trim() ? zcashAddressKind(cashOut.trim()) : null;
  const cashOk = !cashOut.trim() || cashKind !== null;

  async function review() {
    setBusy(true);
    setError(null);
    const choices: PolicyChoices = { dailyLimitUsd, cashOutZec: cashOut.trim() || undefined };
    try {
      setStage({ kind: "review", prepared: await prepareWallet(choices), choices });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare your wallet");
    } finally {
      setBusy(false);
    }
  }

  async function sign(prepared: Prepared, choices: PolicyChoices) {
    setError(null);
    try {
      const result = await signAndCreateWallet(prepared, (step) => setStage({ kind: "working", step }));
      if (result.status === "ACTIVE") setStage({ kind: "done" });
      else if (result.status === "FAILED") {
        setError(`NEAR Intents couldn't create the wallet (${result.reason}). Nothing was charged.`);
        setStage({ kind: "form" });
      } else {
        setError("Your wallet is still being confirmed on NEAR. Check Home in a minute.");
        setStage({ kind: "form" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed");
      setStage({ kind: "review", prepared, choices });
    }
  }

  if (stage.kind === "done") {
    return (
      <section className="glass-card p-6 text-center">
        <CircleCheck size={40} strokeWidth={1.6} className="mx-auto" aria-hidden="true" />
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Your wallet is ready</h2>
        <p className="mt-2 text-sm text-brand-ink/80">Add ZEC, approve the people you pay, and you&apos;re set.</p>
        <Link href="/wallet/receive" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-brand">
          Add ZEC
        </Link>
        <Link href="/" className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm font-medium">
          Go to Home
        </Link>
      </section>
    );
  }

  if (stage.kind === "working") {
    return (
      <section className="panel-hero p-6 text-center" aria-live="polite">
        <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
        <p className="mt-4 text-sm">{stage.step}</p>
        <p className="mt-1 text-xs text-muted">This usually takes under a minute.</p>
      </section>
    );
  }

  if (stage.kind === "review") {
    const { prepared, choices } = stage;
    return (
      <div className="flex flex-col gap-5">
        <PlainWords choices={choices} />
        <section className="panel p-5">
          <p className="eyebrow">NEAR Intents will record</p>
          <p className="mt-3 text-sm leading-relaxed text-snow/85">{prepared.summary}</p>
        </section>
        {error && <ErrorBox message={error} />}
        <button type="button" onClick={() => sign(prepared, choices)} className="btn-primary w-full">
          <Fingerprint size={17} aria-hidden="true" /> Create with Face ID
        </button>
        <button type="button" onClick={() => setStage({ kind: "form" })} className="btn-secondary w-full">
          Change
        </button>
        <p className="text-center text-xs text-dim">Creating the wallet is free.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Daily payment limit</legend>
        <div className="flex rounded-full border border-line bg-panel p-1" role="group" aria-label="Daily limit">
          {[...LIMITS, "custom"].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setLimit(b)}
              aria-pressed={limit === b}
              className={`min-h-10 flex-1 rounded-full text-sm font-medium transition-colors ${limit === b ? "bg-brand text-brand-ink" : "text-muted hover:text-snow"}`}
            >
              {b === "custom" ? "Custom" : `$${b}`}
            </button>
          ))}
        </div>
        {limit === "custom" && (
          <input
            inputMode="decimal"
            placeholder="USD per day, e.g. 500"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
            aria-invalid={custom !== "" && !limitOk}
            className="field mt-2 text-sm"
            aria-label="Custom daily limit in USD"
          />
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted">The most Zorro can pay out in a day, all coins together. NEAR Intents enforces it, not just Zorro.</p>
      </fieldset>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Your own Zcash address <span className="font-normal text-muted">· optional</span>
        </span>
        <input
          value={cashOut}
          onChange={(e) => setCashOut(e.target.value)}
          placeholder="t1… or u1… from Zashi or Vizor"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!cashOk}
          className="field font-mono text-sm"
        />
        <span className="mt-2 block text-xs leading-relaxed text-muted">
          Approved now as your first payee, so you can always move ZEC back to your own wallet.
          {cashKind && cashKind !== "transparent" ? " Shielded delivery via NEAR Intents isn't confirmed yet; a t1 address is safest." : ""}
        </span>
      </label>

      {limitOk && cashOk && <PlainWords choices={{ dailyLimitUsd, cashOutZec: cashOut.trim() || undefined }} />}
      {error && <ErrorBox message={error} />}
      <button type="button" onClick={review} disabled={!limitOk || !cashOk || busy} className="btn-primary w-full">
        {busy ? "Preparing…" : "Review & create"}
      </button>
      <p className="text-xs leading-relaxed text-dim">
        Wallets run on the NEAR Intents Agent API, an experimental mainnet beta. Keep only spending money here and your savings in a shielded Zcash wallet.
      </p>
    </div>
  );
}

function PlainWords({ choices }: { choices: PolicyChoices }) {
  return (
    <section className="panel p-5" aria-label="Your wallet rules in plain words">
      <p className="eyebrow">Your wallet rules</p>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed">
        <li className="flex gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" />
          <span>
            Zorro can pay up to <strong className="font-medium">${choices.dailyLimitUsd} a day</strong>, converting ZEC to the coin each payee wants.
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" />
          <span>
            Money can only go to <strong className="font-medium">payees you approve with Face ID</strong>
            {choices.cashOutZec ? ` (starting with your own wallet ${shortAddress(choices.cashOutZec)})` : ""}.
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" />
          <span>Your balance is private on NEAR Intents. You can freeze or delete the wallet any time.</span>
        </li>
      </ul>
    </section>
  );
}
