"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { buildPaymentLink } from "@/lib/payment-links";
import { toBaseUnits } from "@/lib/assets";
import { shortAddress } from "@/lib/addresses";
import type { DepositInfo } from "@/lib/wallet-service";
import { CopyButton, QrCode, Segmented } from "@/components/ui";

type AssetKey = "zec" | "usdc-base" | "usdc-sol";
const ASSETS: { key: AssetKey; label: string; symbol: string; chain: string; decimals: number }[] = [
  { key: "zec", label: "ZEC", symbol: "ZEC", chain: "Zcash", decimals: 8 },
  { key: "usdc-base", label: "USDC · Base", symbol: "USDC", chain: "Base", decimals: 6 },
  { key: "usdc-sol", label: "USDC · Solana", symbol: "USDC", chain: "Solana", decimals: 6 },
];

const STATUS_TEXT: Record<string, string> = {
  PENDING_DEPOSIT: "Waiting for your deposit",
  PROCESSING: "Deposit seen, crediting your wallet",
  SUCCESS: "Credited to your bot wallet",
  REFUNDED: "Refunded to your bot wallet",
  FAILED: "Deposit failed",
};

export function DepositFlow() {
  const [assetKey, setAssetKey] = useState<AssetKey>("zec");
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = ASSETS.find((x) => x.key === assetKey)!;

  // Follow the deposit until it's credited.
  useEffect(() => {
    if (!deposit) return;
    let cancelled = false;
    const poll = async () => {
      const s = await api<{ status: string }>(`/api/agent/operation?id=${encodeURIComponent(deposit.correlationId)}`).catch(() => null);
      if (!cancelled && s) setStatus(s.status);
    };
    void poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [deposit]);

  async function getAddress() {
    setBusy(true);
    setError(null);
    try {
      const d = await api<DepositInfo>("/api/agent/deposit", { asset: assetKey });
      setDeposit(d);
      setStatus(d.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get a deposit address");
    } finally {
      setBusy(false);
    }
  }

  if (!deposit) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow mb-2 px-1">What are you sending?</p>
          <Segmented label="Asset" value={assetKey} onChange={setAssetKey} options={ASSETS.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
        <p className="text-sm leading-relaxed text-muted">
          You&apos;ll get a one-time NEAR Intents address that credits your bot wallet. Send {a.symbol} on {a.chain} from your own
          wallet. If anything goes wrong, the refund goes back into your bot wallet.
        </p>
        {error && (
          <p role="alert" className="rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down">
            {error}
          </p>
        )}
        <button type="button" onClick={getAddress} disabled={busy} className="btn-primary w-full">
          {busy ? "Getting address…" : "Get deposit address"}
        </button>
      </div>
    );
  }

  const amountOk = /^\d+(\.\d+)?$/.test(amount) && Number(amount) >= Number(deposit.minAmount);
  let link: ReturnType<typeof buildPaymentLink> | null = null;
  if (amountOk) {
    try {
      link = buildPaymentLink(assetKey, deposit.depositAddress, toBaseUnits(amount, a.decimals));
    } catch {
      link = null;
    }
  }
  const qrValue = link?.uri ?? (assetKey === "zec" ? `zcash:${deposit.depositAddress}` : deposit.depositAddress);
  const credited = status === "SUCCESS";

  return (
    <div className="flex flex-col gap-5">
      <section className="panel-hero flex flex-col items-center gap-4 p-5" aria-live="polite">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${credited ? "bg-up/15 text-up" : status === "FAILED" ? "bg-down/15 text-down" : "bg-gold/15 text-gold"}`}>
          {STATUS_TEXT[status ?? ""] ?? status}
        </span>
        {credited ? (
          <>
            <CircleCheck size={40} strokeWidth={1.5} className="text-up" aria-hidden="true" />
            <Link href="/bots/wallet" className="btn-primary w-full">
              See balance
            </Link>
          </>
        ) : (
          <>
            <p className="text-center">
              <span className="eyebrow">Send {a.symbol} on {a.chain}</span>
              <span className="mt-1.5 block text-xs text-muted">Minimum {deposit.minAmount} {a.symbol}</span>
            </p>
            <QrCode value={qrValue} />
            <label className="w-full">
              <span className="eyebrow mb-2 block px-1">Amount (for the wallet link)</span>
              <input
                inputMode="decimal"
                placeholder={`e.g. ${deposit.minAmount}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
                aria-invalid={amount !== "" && !amountOk}
                className="field tabular text-sm"
              />
            </label>
            {link ? (
              <a href={link.openUrl} className="btn-primary w-full">
                Open in wallet
              </a>
            ) : (
              <p className="text-center text-xs text-muted">
                {amount && !amountOk ? `Enter at least ${deposit.minAmount} ${a.symbol}.` : "Enter an amount to get a one-tap wallet link, or copy the address."}
              </p>
            )}
            <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
              <div className="min-w-0">
                <p className="eyebrow text-[9px]">Deposit address</p>
                <p className="truncate font-mono text-sm">{shortAddress(deposit.depositAddress, 10)}</p>
              </div>
              <CopyButton value={deposit.depositAddress} />
            </div>
            {deposit.memo && (
              <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="eyebrow text-[9px] text-gold">Memo (required)</p>
                  <p className="truncate font-mono text-sm">{deposit.memo}</p>
                </div>
                <CopyButton value={deposit.memo} />
              </div>
            )}
            {deposit.expiresAt && (
              <p className="text-center text-xs text-muted">
                Valid until {new Date(deposit.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Only send{" "}
                {a.symbol} on {a.chain} to this address.
              </p>
            )}
          </>
        )}
      </section>
      <p className="text-xs leading-relaxed text-dim">
        Deposits into a bot wallet go through NEAR Intents, an experimental beta. Start with a small amount.
      </p>
    </div>
  );
}
