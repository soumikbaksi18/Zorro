"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { shortAddress } from "@/lib/addresses";
import { useAccount } from "@/lib/account-client";
import type { WalletBalances, WithdrawPreview } from "@/lib/wallet-service";
import { Segmented } from "@/components/ui";

type AssetKey = "zec" | "usdc-base" | "usdc-sol";
const ASSETS: { key: AssetKey; label: string; symbol: string; chain: string; chainName: string }[] = [
  { key: "zec", label: "ZEC", symbol: "ZEC", chain: "zec", chainName: "Zcash" },
  { key: "usdc-base", label: "USDC · Base", symbol: "USDC", chain: "base", chainName: "Base" },
  { key: "usdc-sol", label: "USDC · Solana", symbol: "USDC", chain: "sol", chainName: "Solana" },
];

export function WithdrawFlow() {
  const account = useAccount();
  const [assetKey, setAssetKey] = useState<AssetKey>("zec");
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [preview, setPreview] = useState<WithdrawPreview | null>(null);
  const [sent, setSent] = useState<{ correlationId: string | null; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<WalletBalances>("/api/agent/balances")
      .then((b) => !cancelled && setBalances(b))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow a sent withdrawal until it settles.
  const sentId = sent?.correlationId ?? null;
  useEffect(() => {
    if (!sentId) return;
    let cancelled = false;
    const poll = async () => {
      const s = await api<{ status: string }>(`/api/agent/operation?id=${encodeURIComponent(sentId)}`).catch(() => null);
      if (!cancelled && s) setSent({ correlationId: sentId, status: s.status });
    };
    const timer = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sentId]);

  if (account.status !== "ready" || !account.me.agent) return <div className="panel h-48 animate-pulse" />;
  const a = ASSETS.find((x) => x.key === assetKey)!;
  const destination = account.me.agent.withdrawTo.find((d) => d.chain === a.chain);
  const available = balances?.assets.find((x) => x.key === assetKey)?.amount ?? null;
  const amountOk = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;

  const choose = (k: AssetKey) => {
    setAssetKey(k);
    setPreview(null);
    setError(null);
  };

  async function run(dry: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (dry) setPreview(await api<WithdrawPreview>("/api/agent/withdraw", { asset: assetKey, amount, dry: true }));
      else setSent(await api<{ correlationId: string | null; status: string }>("/api/agent/withdraw", { asset: assetKey, amount, dry: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const done = sent.status === "SUCCESS";
    return (
      <section className="panel-hero flex flex-col items-center gap-3 p-5 text-center" aria-live="polite">
        {done ? <CircleCheck size={40} strokeWidth={1.5} className="text-up" aria-hidden="true" /> : <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-fox-light" aria-hidden="true" />}
        <p className="text-base">{done ? "Withdrawal complete" : `Withdrawal ${sent.status.replaceAll("_", " ").toLowerCase()}`}</p>
        <p className="text-xs text-muted">
          {amount} {a.symbol} to {destination ? shortAddress(destination.address) : "your address"} on {a.chainName}
        </p>
        <Link href="/bots/wallet" className="btn-secondary mt-2 w-full">
          Back to wallet
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="eyebrow mb-2 px-1">Asset</p>
        <Segmented label="Asset" value={assetKey} onChange={choose} options={ASSETS.map((x) => ({ value: x.key, label: x.label }))} />
      </div>

      {!destination ? (
        <p className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-sm text-gold">
          Your signed limits don&apos;t include a {a.chainName} address, so {a.symbol} on {a.chainName} can&apos;t be withdrawn. Swap it to another asset first.
        </p>
      ) : (
        <>
          <div className="panel p-4 focus-within:border-fox-light">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Amount</p>
              {available !== null && (
                <button type="button" onClick={() => { setAmount(available); setPreview(null); }} className="font-mono text-[10px] tracking-[0.1em] text-fox-light uppercase">
                  Max {available}
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
                  setPreview(null);
                }}
                className="tabular w-full min-w-0 bg-transparent py-2 text-[30px] font-light tracking-[-0.03em] outline-none placeholder:text-dim"
                aria-label={`Amount of ${a.symbol} to withdraw`}
              />
              <span className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm font-medium">{a.symbol}</span>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
            <p className="eyebrow text-[9px]">To your {a.chainName} address (from your signed limits)</p>
            <p className="mt-0.5 truncate font-mono text-sm">{shortAddress(destination.address, 10)}</p>
          </div>

          {preview && (
            <section className="panel p-4 text-sm">
              <p className="eyebrow">Preview</p>
              <dl className="tabular mt-2 space-y-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">You receive</dt>
                  <dd>{preview.receiveAmount ? `${preview.receiveAmount} ${a.symbol}` : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Network fee</dt>
                  <dd>{preview.feeUsd ? `$${Number(preview.feeUsd).toFixed(2)} (${preview.feePercent}%)` : "—"}</dd>
                </div>
              </dl>
              {preview.problems.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {preview.problems.map((p) => (
                    <li key={p} className="rounded-lg bg-down/10 px-3 py-2 text-xs text-down">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
              {error}
            </p>
          )}

          {preview && preview.problems.length === 0 ? (
            <button type="button" onClick={() => run(false)} disabled={busy} className="btn-primary w-full">
              {busy ? "Sending…" : `Withdraw ${amount} ${a.symbol}`}
            </button>
          ) : (
            <button type="button" onClick={() => run(true)} disabled={busy || !amountOk} className="btn-primary w-full">
              {busy ? "Checking…" : "Preview withdrawal"}
            </button>
          )}
          <p className="text-xs leading-relaxed text-dim">
            Withdrawals count towards your daily budget. ZEC arrives at a transparent address: shield it in your wallet afterwards.
          </p>
        </>
      )}
    </div>
  );
}
