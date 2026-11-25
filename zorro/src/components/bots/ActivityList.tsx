"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { ActivityItem } from "@/lib/wallet-service";

const TONE: Record<string, string> = {
  SUCCESS: "bg-up/15 text-up",
  FAILED: "bg-down/15 text-down",
  REFUNDED: "bg-down/15 text-down",
  NEEDS_REVIEW: "bg-gold/15 text-gold",
};

/** Deposits, withdrawals and bot trades for the bot wallet. */
export function ActivityList() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<ActivityItem[]>("/api/agent/activity")
      .then((d) => !cancelled && setItems(d))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel p-5" aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="eyebrow">
        Wallet activity
      </h2>
      {items === null ? (
        <div className="mt-3 h-16 animate-pulse rounded-xl bg-surface" />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No deposits, withdrawals or bot trades yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {items.map((i) => (
            <li key={(i.correlationId ?? "") + i.at} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm">{i.summary}</span>
                <span className="text-xs text-muted">{new Date(i.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[i.status] ?? "bg-surface-2 text-muted"}`}>
                {i.status.replaceAll("_", " ").toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
