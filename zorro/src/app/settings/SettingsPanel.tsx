"use client";

import { useCurrency, useDeviceId } from "@/lib/client-prefs";
import { deleteAllSwaps, useSwaps } from "@/lib/swap-store";

export function SettingsPanel() {
  const [currency, setCurrency] = useCurrency();
  const deviceId = useDeviceId();
  const swaps = useSwaps();

  return (
    <section className="panel divide-y divide-line" aria-label="Preferences">
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="font-medium">Display currency</p>
          <p className="text-xs text-muted">Prices and order amounts</p>
        </div>
        <div className="flex rounded-full border border-line p-0.5 text-xs font-medium" role="group" aria-label="Currency">
          {(["INR", "USD"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={`rounded-full px-3 py-1.5 transition-colors ${currency === c ? "bg-fox text-snow" : "text-muted"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="font-medium">Swap history</p>
          <p className="text-xs text-muted">
            {swaps === null ? "…" : `${swaps.length} swap${swaps.length === 1 ? "" : "s"} stored on this phone`}
          </p>
        </div>
        <button
          type="button"
          disabled={!swaps?.length}
          onClick={() => {
            if (confirm("Delete all swap history from this phone? Swaps already in progress keep running on NEAR Intents.")) {
              deleteAllSwaps();
            }
          }}
          className="rounded-lg border border-down/40 px-3 py-1.5 text-xs font-medium text-down disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      <div className="p-4">
        <p className="font-medium">Device ID</p>
        <p className="text-xs text-muted">Anonymous. Links your orders and notifications to this phone.</p>
        <p className="mt-2 break-all rounded-lg border border-line bg-ink px-3 py-2 font-mono text-xs text-snow/80">
          {deviceId ?? "…"}
        </p>
      </div>
    </section>
  );
}
