"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import type { BotView } from "@/lib/bots/service";

export const BOT_STATUS_TONE: Record<string, string> = {
  active: "bg-up/15 text-up",
  paused: "bg-gold/15 text-gold",
  stopped: "bg-surface-2 text-muted",
  error: "bg-down/15 text-down",
  draft: "bg-surface-2 text-muted",
};

/** The user's bots, shown once they have a bot wallet. */
export function MyBots() {
  const account = useAccount();
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";
  const [bots, setBots] = useState<BotView[] | null>(null);

  useEffect(() => {
    if (!hasWallet) return;
    let cancelled = false;
    api<BotView[]>("/api/bots")
      .then((b) => !cancelled && setBots(b))
      .catch(() => !cancelled && setBots([]));
    return () => {
      cancelled = true;
    };
  }, [hasWallet]);

  if (!hasWallet) return null;
  return (
    <section aria-labelledby="mybots-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="mybots-heading" className="eyebrow">
          Your bots
        </h2>
        <Link href="/bots/new" className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] text-fox-light uppercase">
          <Plus size={12} /> New bot
        </Link>
      </div>
      {bots === null ? (
        <div className="panel h-20 animate-pulse" />
      ) : bots.length === 0 ? (
        <Link href="/bots/new" className="panel flex items-center justify-between gap-3 border-dashed p-4 text-sm text-muted hover:border-fox/60">
          No bots yet. Start with a paper bot: it uses real quotes but never moves money.
          <ArrowUpRight size={16} className="shrink-0" />
        </Link>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {bots.map((b) => (
            <li key={b.id}>
              <Link href={`/bots/${b.id}`} className="panel flex items-center gap-3 p-4 transition-colors hover:border-fox/60 hover:bg-fox/5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {b.name}
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] uppercase ${b.mode === "live" ? "bg-fox/20 text-fox-light" : "bg-surface-2 text-muted"}`}>
                      {b.mode}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{b.description}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${BOT_STATUS_TONE[b.status] ?? ""}`}>
                  {b.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
