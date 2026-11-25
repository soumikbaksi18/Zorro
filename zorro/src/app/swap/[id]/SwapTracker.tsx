"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shortAddress } from "@/lib/addresses";
import type { SwapStatusView } from "@/lib/swap";
import { STATUS_LABEL, STATUS_TONE, TERMINAL_STATUSES, TONE_CLASSES, statusStep } from "@/lib/swap-status";
import { updateSwap, useSwaps } from "@/lib/swap-store";
import { CopyButton, QrCode } from "@/components/ui";

const POLL_MS = 10_000;

export function SwapTracker({ id }: { id: string }) {
  const swaps = useSwaps();
  const swap = swaps?.find((s) => s.id === id);
  const [live, setLive] = useState<SwapStatusView | null>(null);
  const [pollError, setPollError] = useState(false);

  const status = live?.status ?? swap?.status ?? "PENDING_DEPOSIT";
  const finished = TERMINAL_STATUSES.includes(status);

  // Poll NEAR Intents (through our API) until the swap finishes.
  useEffect(() => {
    if (finished) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/swap/status?depositAddress=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error();
        const data: SwapStatusView = await res.json();
        if (cancelled) return;
        setLive(data);
        setPollError(false);
        updateSwap(id, {
          status: data.status,
          statusUpdatedAt: data.updatedAt,
          receivedAmount: data.receivedAmount,
          refundedAmount: data.refundedAmount,
          refundReason: data.refundReason,
          destinationTx: data.destinationTx,
        });
      } catch {
        if (!cancelled) setPollError(true);
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, finished]);

  if (swaps === null) return <p className="text-muted">Loading swap…</p>;

  if (!swap) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h1 className="text-xl font-semibold">Swap not on this phone</h1>
        <p className="mt-2 text-sm text-muted">
          Zorro keeps swaps on the device that created them.
          {live && <> NEAR Intents reports this swap as: <strong className="text-snow">{STATUS_LABEL[live.status]}</strong>.</>}
        </p>
        <Link href="/orders" className="mt-4 inline-block text-sm font-medium text-fox-light">
          Go to your orders
        </Link>
      </div>
    );
  }

  const { quote } = swap;
  const tone = STATUS_TONE[status];
  const step = statusStep(status);

  return (
    <>
      <header>
        <Link href="/orders" className="text-sm text-muted hover:text-snow">
          ← Orders
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {quote.direction === "sell" ? "Sell" : "Buy"} {quote.direction === "sell" ? quote.send.amount : quote.receive.amount} ZEC
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>{STATUS_LABEL[status]}</span>
          {!finished && <span className="text-xs text-muted">{pollError ? "Can't reach NEAR Intents, retrying…" : "Updates every 10s"}</span>}
        </div>
      </header>

      <Steps step={step} failed={tone === "bad"} />

      {status === "PENDING_DEPOSIT" && quote.payment && quote.depositAddress && (
        <section className="flex flex-col items-center gap-4 rounded-3xl border border-line bg-surface p-5" aria-label="Deposit">
          <p className="text-center text-sm text-muted">
            Send exactly
            <span className="tabular mt-1 block text-3xl font-semibold text-snow">
              {quote.send.amount} {quote.send.symbol}
            </span>
            {quote.send.chainName !== "Zcash" && <span className="block">on {quote.send.chainName}</span>}
          </p>
          <QrCode value={quote.payment.uri} />
          <a
            href={quote.payment.openUrl}
            className="w-full rounded-2xl bg-fox py-3.5 text-center font-semibold text-snow"
          >
            Open in wallet
          </a>
          <p className="-mt-2 text-center text-xs text-muted">Works with {quote.payment.walletHint}. Or scan the QR code.</p>

          <div className="w-full space-y-2">
            <CopyRow label="Deposit address" value={quote.depositAddress} display={shortAddress(quote.depositAddress, 10)} />
            <CopyRow label="Amount" value={quote.send.amount} display={`${quote.send.amount} ${quote.send.symbol}`} />
          </div>

          {quote.deadline && (
            <p className="text-center text-xs text-muted">
              Deposit before {new Date(quote.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
              After that, any deposit is refunded.
            </p>
          )}
        </section>
      )}

      {status === "SUCCESS" && (
        <Result tone="good" title={`Received ${swap.receivedAmount ?? quote.receive.amount} ${quote.receive.symbol}`}>
          Sent to {shortAddress(swap.recipient)} on {quote.receive.chainName}.
          {swap.destinationTx?.url && (
            <a href={swap.destinationTx.url} target="_blank" rel="noreferrer" className="mt-2 block font-medium text-fox-light">
              View transaction ↗
            </a>
          )}
        </Result>
      )}
      {status === "REFUNDED" && (
        <Result tone="bad" title={`Refunded ${swap.refundedAmount ?? ""} ${quote.send.symbol}`}>
          {swap.refundReason ? `Reason: ${swap.refundReason}. ` : ""}Returned to {shortAddress(swap.refundTo)}.
        </Result>
      )}
      {status === "INCOMPLETE_DEPOSIT" && (
        <Result tone="bad" title="Deposit was less than the quote">
          NEAR Intents will refund it to {shortAddress(swap.refundTo)} after the deadline.
        </Result>
      )}
      {status === "FAILED" && (
        <Result tone="bad" title="Swap failed">
          NEAR Intents couldn&apos;t complete this swap. Funds are returned to your refund address.
        </Result>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <dl className="tabular space-y-2 text-sm">
          <Detail label="You send" value={`${quote.send.amount} ${quote.send.symbol} (${quote.send.chainName})`} />
          <Detail label="You receive (est.)" value={`${quote.receive.amount} ${quote.receive.symbol} (${quote.receive.chainName})`} />
          <Detail label="Guaranteed minimum" value={`${quote.receive.minAmount} ${quote.receive.symbol}`} />
          <Detail label="Receiving address" value={shortAddress(swap.recipient)} />
          <Detail label="Refund address" value={shortAddress(swap.refundTo)} />
          <Detail label="Created" value={new Date(swap.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} />
        </dl>
      </section>
    </>
  );
}

function Steps({ step, failed }: { step: number; failed: boolean }) {
  const labels = ["Deposit", "Swapping", failed ? "Stopped" : "Done"];
  return (
    <ol className="flex gap-2" aria-label="Progress">
      {labels.map((label, i) => {
        const done = i < step || (i === step && i === 2 && !failed);
        const current = i === step;
        return (
          <li key={label} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${
                done ? "bg-up" : current ? (failed && i === 2 ? "bg-down" : "bg-fox-light animate-pulse") : "bg-surface-2"
              }`}
            />
            <p className={`mt-1.5 text-xs ${current ? "text-snow" : "text-muted"}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}

function CopyRow({ label, value, display }: { label: string; value: string; display: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate font-mono text-sm">{display}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

function Result({ tone, title, children }: { tone: "good" | "bad"; title: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl p-4 text-sm ${tone === "good" ? "bg-up/10" : "bg-down/10"}`}>
      <p className={`font-semibold ${tone === "good" ? "text-up" : "text-down"}`}>{title}</p>
      <div className="mt-1 text-snow/80">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-snow/90">{value}</dd>
    </div>
  );
}
