"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCurrency } from "@/lib/client-prefs";
import { useSwaps } from "@/lib/swap-store";

export function SettingsPanel() {
  const [currency, setCurrency] = useCurrency();
  const swaps = useSwaps();

  return (
    <section className="panel divide-y divide-line" aria-label="Preferences">
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium">Show amounts in</p>
          <p className="text-xs text-muted">Balances, payments and the Tracker</p>
        </div>
        <div className="flex rounded-full border border-line p-0.5 text-xs font-medium" role="group" aria-label="Currency">
          {(["INR", "USD"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={`rounded-full px-3 py-1.5 transition-colors ${currency === c ? "bg-brand text-brand-ink" : "text-muted"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
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
