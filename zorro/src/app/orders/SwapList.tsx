"use client";

import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE, TONE_CLASSES } from "@/lib/swap-status";
import { useSwaps } from "@/lib/swap-store";

export function SwapList() {
  const swaps = useSwaps();

  if (swaps === null) {
    return <div className="panel h-24 animate-pulse" />;
  }

  if (swaps.length === 0) {
    return (
      <section className="panel flex flex-col items-center border-dashed px-6 py-12 text-center">
        <p className="eyebrow">Nothing here yet</p>
        <p className="mt-3 max-w-72 text-sm text-muted">
          Swaps and bot trades show up here with their live status.
        </p>
        <Link href="/swap" className="btn-primary mt-6 min-h-11 px-5 text-[13px]">
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
              className="panel flex items-center justify-between gap-3 p-4 transition-colors hover:border-zec/60 hover:bg-zec/5"
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
