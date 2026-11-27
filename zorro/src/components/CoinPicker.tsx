"use client";

import { COINS } from "@/lib/coins";
import { CoinBadge } from "./money";

/** Grid of coins (each on its chain) to choose from. */
export function CoinPicker({
  value,
  onChange,
  label,
  only,
  amounts,
}: {
  value: string | null;
  onChange: (key: string) => void;
  label: string;
  only?: readonly string[];
  /** Optional amount line under each coin (e.g. how much to pay in it). */
  amounts?: Record<string, string | null>;
}) {
  const list = only ? COINS.filter((c) => only.includes(c.key)) : COINS;
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {list.map((c) => {
        const selected = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(c.key)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition-colors ${
              selected ? "border-zec bg-zec/10" : "border-line bg-panel hover:border-line-strong"
            }`}
          >
            <CoinBadge coinKey={c.key} size={30} />
            <span className="text-[13px] leading-tight font-medium">{c.symbol}</span>
            <span className="text-[10px] leading-tight text-muted">{c.chainName}</span>
            {amounts && <span className="tabular text-[10px] leading-tight text-snow/70">{amounts[c.key] ?? "—"}</span>}
          </button>
        );
      })}
    </div>
  );
}
