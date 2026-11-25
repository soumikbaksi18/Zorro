"use client";

import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE, TONE_CLASSES } from "@/lib/swap-status";
import { useSwaps } from "@/lib/swap-store";

export function SwapList() {
  const swaps = useSwaps();

  if (swaps === null) {
    return <div className="h-24 animate-pulse rounded-2xl bg-surface" />;
  }

  if (swaps.length === 0) {
    return (
      <section className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
        <p className="font-medium">No orders yet</p>
        <p className="mt-1 max-w-64 text-sm text-muted">
          Swaps, take-profits, stop-losses and DCA plans show up here with their live status.
        </p>
        <Link href="/swap" className="mt-5 rounded-xl bg-fox px-5 py-2.5 text-sm font-medium text-snow">
          Make a swap
        </Link>
      </section>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {swaps.map((s) => {
        const selling = s.quote.direction === "sell";
        return (
          <li key={s.id}>
            <Link
              href={`/swap/${encodeURIComponent(s.id)}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-fox/60"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {selling ? "Sell" : "Buy"} {selling ? s.quote.send.amount : s.quote.receive.amount} ZEC
                </p>
                <p className="tabular mt-0.5 truncate text-xs text-muted">
                  {selling
                    ? `for ≈ ${s.quote.receive.amount} USDC on ${s.quote.receive.chainName}`
                    : `with ${s.quote.send.amount} USDC on ${s.quote.send.chainName}`}
                  {" · "}
                  {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[STATUS_TONE[s.status]]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
