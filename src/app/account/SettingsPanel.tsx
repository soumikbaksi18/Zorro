"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useSwaps } from "@/lib/swap-store";

export function SettingsPanel() {
  const swaps = useSwaps();

  return (
    <section className="panel divide-y divide-line" aria-label="Preferences">
      <Link href="/orders" className="flex items-center justify-between gap-4 p-4 hover:bg-white/3">
        <div>
          <p className="text-sm font-medium">Payments from other wallets</p>
          <p className="text-xs text-muted">
            {swaps === null ? "…" : `${swaps.length} stored on this phone`} (paid straight from Zashi, Vizor, MetaMask…)
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-dim" aria-hidden="true" />
      </Link>
    </section>
  );
}
