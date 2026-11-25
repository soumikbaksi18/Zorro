"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleCheck, Fingerprint, ShieldCheck } from "lucide-react";
import { isEvmAddress, isSolanaAddress, shortAddress, zcashAddressKind } from "@/lib/addresses";
import { prepareWallet, signAndCreateWallet, useAccount, type PolicyChoices } from "@/lib/account-client";
import { useSavedAddresses } from "@/lib/swap-store";
import { PasskeyGate } from "@/components/bots/PasskeyGate";

const BUDGETS = ["25", "50", "100"];

type Stage =
  | { kind: "form" }
  | { kind: "review"; prepared: Awaited<ReturnType<typeof prepareWallet>>; choices: PolicyChoices; minutes: number }
  | { kind: "working"; step: string }
  | { kind: "done" };

export function SetupFlow() {
  const account = useAccount();
  const saved = useSavedAddresses();
  const [budget, setBudget] = useState("50");
  const [customBudget, setCustomBudget] = useState("");
  const [zecInput, setZecInput] = useState<string | null>(null);
  const [baseInput, setBaseInput] = useState<string | null>(null);
  const [solInput, setSolInput] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status === "error") return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account.</p>;
  if (!account.me.user) return <PasskeyGate />;
  if (account.me.agent && stage.kind !== "done") {
    return (
      <div className="panel p-5 text-sm">
        You already have a bot wallet.{" "}
        <Link href="/bots/wallet" className="text-fox-light">
          Open it
        </Link>
      </div>
    );
  }

  // Prefill from addresses used for swaps on this phone, until the user types.
  const withdrawZec = zecInput ?? saved.zec ?? "";
  const withdrawBase = baseInput ?? saved.base ?? "";
  const dailyBudgetUsd = budget === "custom" ? customBudget.trim() : budget;

  const zecKind = zcashAddressKind(withdrawZec);
  const budgetOk = /^[1-9]\d{0,4}(\.\d{1,2})?$/.test(dailyBudgetUsd);
  const baseOk = !withdrawBase || isEvmAddress(withdrawBase);
  const solOk = !solInput || isSolanaAddress(solInput);
  const canReview = budgetOk && zecKind !== null && baseOk && solOk && !busy;

  async function review() {
    setBusy(true);
    setError(null);
    const choices: PolicyChoices = {
      dailyBudgetUsd,
      withdrawZec: withdrawZec.trim(),
      withdrawUsdcBase: withdrawBase.trim() || undefined,
      withdrawUsdcSol: solInput.trim() || undefined,
    };
    try {
      const prepared = await prepareWallet(choices);
      setStage({ kind: "review", prepared, choices, minutes: minutesUntil(prepared.expiresAt) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare your wallet");
    } finally {
      setBusy(false);
    }
  }

  async function sign(prepared: Awaited<ReturnType<typeof prepareWallet>>, choices: PolicyChoices) {
    setError(null);
    try {
      const result = await signAndCreateWallet(prepared, (step) => setStage({ kind: "working", step }));
      if (result.status === "ACTIVE") setStage({ kind: "done" });
      else if (result.status === "FAILED") {
        setError(`NEAR Intents couldn't create the wallet (${result.reason}). Nothing was charged.`);
        setStage({ kind: "form" });
      } else {
        setError("Your wallet is still being confirmed on NEAR. Check the Bots page in a minute.");
        setStage({ kind: "form" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed");
      setStage({ kind: "review", prepared, choices, minutes: minutesUntil(prepared.expiresAt) });
    }
  }

  if (stage.kind === "done") {
    return (
      <section className="panel-hero p-5 text-center">
        <CircleCheck size={36} strokeWidth={1.5} className="mx-auto text-up" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-light tracking-[-0.02em]">Your bot wallet is ready</h2>
        <p className="mt-2 text-sm text-muted">Zorro can now trade within the limits you signed.</p>
        <Link href="/bots/wallet" className="btn-primary mt-5 w-full">
          Open bot wallet
        </Link>
      </section>
    );
  }

  if (stage.kind === "working") {
    return (
      <section className="panel-hero p-5 text-center" aria-live="polite">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-fox-light" aria-hidden="true" />
        <p className="mt-4 text-sm">{stage.step}</p>
        <p className="mt-1 text-xs text-muted">This usually takes under a minute.</p>
      </section>
    );
  }

  if (stage.kind === "review") {
    const { prepared, choices, minutes } = stage;
    return (
      <div className="flex flex-col gap-5">
        <PlainWords choices={choices} />
        <section className="panel p-5">
          <p className="eyebrow">NEAR Intents will record</p>
          <p className="mt-3 text-sm leading-relaxed text-snow/90">{prepared.summary}</p>
        </section>
        {error && (
          <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
            {error}
          </p>
        )}
        <button type="button" onClick={() => sign(prepared, choices)} className="btn-primary w-full">
          <Fingerprint size={17} aria-hidden="true" /> Sign with passkey
        </button>
        <button type="button" onClick={() => setStage({ kind: "form" })} className="btn-secondary w-full">
          Change limits
        </button>
        <p className="text-center text-xs text-dim">Sign within about {minutes} minutes. Creating the wallet is free.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="eyebrow mb-2 px-1">Daily budget</legend>
        <div className="flex rounded-full border border-line bg-panel p-1" role="group" aria-label="Daily budget">
          {[...BUDGETS, "custom"].map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBudget(b)}
              aria-pressed={budget === b}
              className={`min-h-10 flex-1 rounded-full text-sm font-medium transition-colors ${
                budget === b ? "bg-fox text-snow" : "text-muted hover:text-snow"
              }`}
            >
              {b === "custom" ? "Custom" : `$${b}`}
            </button>
          ))}
        </div>
        {budget === "custom" && (
          <input
            inputMode="decimal"
            placeholder="USD per day, e.g. 75"
            value={customBudget}
            onChange={(e) => setCustomBudget(e.target.value.replace(/[^\d.]/g, ""))}
            aria-invalid={customBudget !== "" && !budgetOk}
            className="field mt-2 text-sm"
            aria-label="Custom daily budget in USD"
          />
        )}
        <p className="mt-1.5 px-1 text-xs text-muted">The most your bots can trade in a day. NEAR Intents enforces it.</p>
      </fieldset>

      <Address
        label="ZEC withdrawals go to · required"
        value={withdrawZec}
        onChange={setZecInput}
        ok={zecKind !== null}
        placeholder="Your Zcash address (t1… or u1…)"
        hint={
          zecKind === "unified" || zecKind === "sapling"
            ? "Shielded address. NEAR Intents' docs list Zcash as transparent-only, so delivery here isn't confirmed yet."
            : "Your own Zcash address, e.g. from Zodl. NEAR Intents delivers ZEC to transparent (t1) addresses."
        }
      />
      <Address
        label="USDC withdrawals on Base · optional"
        value={withdrawBase}
        onChange={setBaseInput}
        ok={baseOk}
        placeholder="0x…"
      />
      <Address
        label="USDC withdrawals on Solana · optional"
        value={solInput}
        onChange={setSolInput}
        ok={solOk}
        placeholder="Solana address"
      />

      {budgetOk && zecKind && (
        <PlainWords
          choices={{
            dailyBudgetUsd,
            withdrawZec,
            withdrawUsdcBase: withdrawBase || undefined,
            withdrawUsdcSol: solInput || undefined,
          }}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
          {error}
        </p>
      )}
      <button type="button" onClick={review} disabled={!canReview} className="btn-primary w-full">
        {busy ? "Preparing…" : "Review & sign"}
      </button>
      <p className="text-xs leading-relaxed text-dim">
        Bot wallets run on the NEAR Intents Agent API, an experimental mainnet beta. Only fund them with amounts
        you can afford to lose.
      </p>
    </div>
  );
}

function minutesUntil(iso: string): number {
  return Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

function PlainWords({ choices }: { choices: PolicyChoices }) {
  const destinations = [
    { label: "ZEC", address: choices.withdrawZec },
    choices.withdrawUsdcBase && { label: "USDC · Base", address: choices.withdrawUsdcBase },
    choices.withdrawUsdcSol && { label: "USDC · Solana", address: choices.withdrawUsdcSol },
  ].filter(Boolean) as { label: string; address: string }[];
  return (
    <section className="panel p-5" aria-label="Your limits in plain words">
      <p className="eyebrow">In plain words</p>
      <ul className="mt-3 space-y-2.5 text-sm leading-relaxed">
        <li className="flex gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" />
          <span>
            Zorro&apos;s bots may <strong className="font-medium">swap ZEC ⇄ USDC and place limit orders</strong>,
            up to <strong className="font-medium">${choices.dailyBudgetUsd} a day</strong> and 20 trades an hour.
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" />
          <span>
            Money can only leave the wallet to{" "}
            {destinations.map((d, i) => (
              <span key={d.label}>
                {i > 0 && (i === destinations.length - 1 ? " and " : ", ")}
                <span className="font-mono text-xs">{shortAddress(d.address)}</span> ({d.label})
              </span>
            ))}
            .
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-up" aria-hidden="true" />
          <span>You can freeze the wallet or revoke Zorro&apos;s access at any time with your passkey.</span>
        </li>
      </ul>
    </section>
  );
}

function Address(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ok: boolean;
  placeholder: string;
  hint?: string;
}) {
  const showError = props.value.trim() !== "" && !props.ok;
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
      {showError ? (
        <span className="mt-1 block px-1 text-xs text-down">That address doesn&apos;t look right for this network.</span>
      ) : (
        props.hint && <span className="mt-1 block px-1 text-xs leading-relaxed text-muted">{props.hint}</span>
      )}
    </label>
  );
}
