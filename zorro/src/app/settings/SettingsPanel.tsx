"use client";

import { useCurrency, useDeviceId } from "@/lib/client-prefs";

export function SettingsPanel() {
  const [currency, setCurrency] = useCurrency();
  const deviceId = useDeviceId();

  return (
    <section className="divide-y divide-line rounded-2xl border border-line bg-surface">
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
      <div className="p-4">
        <p className="font-medium">Device ID</p>
        <p className="text-xs text-muted">Anonymous. Links your orders and notifications to this phone.</p>
        <p className="mt-2 break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-snow/80">
          {deviceId ?? "…"}
        </p>
      </div>
    </section>
  );
}
