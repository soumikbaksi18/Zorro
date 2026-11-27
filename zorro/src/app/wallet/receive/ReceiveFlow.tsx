"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { coin, paymentUri, toUnits } from "@/lib/coins";
import type { DepositInfo } from "@/lib/wallet-service";
import { CoinPicker } from "@/components/CoinPicker";
import { coinName, StatusBadge } from "@/components/money";
import { CopyButton, ErrorBox, QrCode } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

export function ReceiveFlow() {
  const account = useAccount();
  const [coinKey, setCoinKey] = useState("zec");
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the deposit until it lands.
  useEffect(() => {
    if (!deposit) return;
    let cancelled = false;
    const poll = () =>
      api<{ status: string }>(`/api/agent/operation?id=${encodeURIComponent(deposit.correlationId)}`)
        .then((s) => !cancelled && setStatus(s.status))
        .catch(() => {});
    const id = setInterval(poll, 8_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deposit]);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to add money" />;
  if (account.me.agent?.status !== "ACTIVE") {
    return (
      <div className="panel p-5 text-sm">
        Create your wallet first.{" "}
        <Link href="/wallet/setup" className="text-zec">
          Create wallet
        </Link>
      </div>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    setDeposit(null);
    setStatus(null);
    try {
      const d = await api<DepositInfo>("/api/agent/deposit", { coinKey });
      setDeposit(d);
      setStatus(d.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get an address");
    } finally {
      setBusy(false);
    }
  }

  if (deposit) {
    const c = coin(deposit.coinKey);
    let uri: string | null = null;
    try {
      uri = deposit.memo ? null : paymentUri(c, deposit.depositAddress, amount ? toUnits(amount, c.decimals) : "0");
    } catch {}
    const done = status === "SUCCESS";
    return (
      <div className="flex flex-col gap-5">
        {done ? (
          <section className="glass-card p-6 text-center" aria-live="polite">
            <CircleCheck size={40} className="mx-auto" aria-hidden="true" />
            <h2 className="mt-3 text-2xl font-semibold">Money added</h2>
            <p className="mt-1 text-sm text-zec-ink/80">Your {c.symbol} is in your Zorro balance.</p>
            <Link href="/" className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-zec-ink text-sm font-semibold text-zec">
              Go to Home
            </Link>
          </section>
        ) : (
          <section className="panel-hero flex flex-col items-center gap-4 p-5 text-center">
            <p className="text-sm">
              Send <strong className="font-medium">{coinName(c)}</strong> to this address
            </p>
            <QrCode value={uri && amount ? uri : deposit.depositAddress} size={200} />
            <p className="w-full rounded-2xl border border-line bg-ink px-3 py-3 font-mono text-[13px] break-all text-snow/90">{deposit.depositAddress}</p>
            {deposit.memo && (
              <p className="w-full rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
                Memo (required): <span className="font-mono">{deposit.memo}</span>
              </p>
            )}
            <div className="flex gap-2">
              <CopyButton value={deposit.depositAddress} label="Copy address" />
              {uri && amount && (
                <a href={uri} className="shrink-0 rounded-full bg-zec px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-zec-ink uppercase">
                  Open wallet
                </a>
              )}
            </div>
            <StatusBadge status={status === "PROCESSING" ? "converting" : "pending"} />
          </section>
        )}
        {!done && (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Amount <span className="font-normal text-muted">· optional, fills the QR for your wallet app</span>
              </span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`e.g. 0.5 ${c.symbol}`} className="field text-sm" />
            </label>
            <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted">
              <li>• Minimum {deposit.minAmount} {c.symbol}. Smaller amounts aren&apos;t credited.</li>
              <li>• Only send {coinName(c)} to this address. Other coins or chains are lost.</li>
              {c.kind === "zec" && <li>• It&apos;s a transparent (t1) address: your wallet app sends to it normally, including from a shielded balance.</li>}
              {deposit.expiresAt && <li>• Use it within 3 days. It&apos;s for one deposit: get a new address next time.</li>}
            </ul>
            <button type="button" onClick={() => setDeposit(null)} className="btn-secondary w-full">
              Choose another coin
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CoinPicker value={coinKey} onChange={setCoinKey} label="Coin to add" />
      <p className="text-xs leading-relaxed text-muted">
        Tip: add <strong className="font-medium text-snow/80">ZEC</strong>. Zorro converts it to whatever each payee wants at the moment you pay.
      </p>
      {error && <ErrorBox message={error} />}
      <button type="button" onClick={create} disabled={busy} className="btn-primary w-full">
        {busy ? "Getting an address…" : `Get ${coinName(coin(coinKey))} address`}
      </button>
    </div>
  );
}
