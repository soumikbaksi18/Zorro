"use client";

// Money display pieces shared by every screen.

import { useSyncExternalStore } from "react";
import { CircleCheck, CircleDashed, CircleX, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { findCoin, type Coin } from "@/lib/coins";
import { useCurrency, type Currency } from "@/lib/client-prefs";
import { formatFiat } from "@/lib/format";

const COIN_STYLE: Record<string, { bg: string; fg: string; glyph: string }> = {
  ZEC: { bg: "#f4b728", fg: "#1c1505", glyph: "ⓩ" },
  USDC: { bg: "#2775ca", fg: "#ffffff", glyph: "$" },
  USDT: { bg: "#26a17b", fg: "#ffffff", glyph: "₮" },
  SOL: { bg: "linear-gradient(135deg,#9945ff,#14f195)", fg: "#ffffff", glyph: "S" },
  ETH: { bg: "#627eea", fg: "#ffffff", glyph: "Ξ" },
  BTC: { bg: "#f7931a", fg: "#ffffff", glyph: "₿" },
  NEAR: { bg: "#f2f1e9", fg: "#111111", glyph: "N" },
};

/** Round coin mark with a small chain label underneath when the symbol lives on several chains. */
export function CoinBadge({ coinKey, size = 36, showChain = false }: { coinKey: string; size?: number; showChain?: boolean }) {
  const c = findCoin(coinKey);
  const s = COIN_STYLE[c?.symbol ?? ""] ?? { bg: "#3d3727", fg: "#f7f3e8", glyph: (c?.symbol ?? "?").slice(0, 1) };
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid place-items-center rounded-full font-semibold"
        style={{ width: size, height: size, background: s.bg, color: s.fg, fontSize: size * 0.46 }}
        aria-hidden="true"
      >
        {s.glyph}
      </span>
      {showChain && c && c.kind !== "zec" && c.symbol.toUpperCase() !== c.chainName.toUpperCase() && (
        <span className="absolute -right-1 -bottom-1 rounded-full border border-ink bg-surface-2 px-1 text-[8px] leading-[14px] font-medium text-snow">
          {c.chainName.slice(0, 4)}
        </span>
      )}
    </span>
  );
}

export function coinName(c: Coin | undefined): string {
  if (!c) return "?";
  return c.kind === "zec" || c.symbol.toUpperCase() === c.chainName.toUpperCase() ? c.symbol : `${c.symbol} on ${c.chainName}`;
}

/** Fiat in the user's display currency (INR by default). */
export function useFiat(): { currency: Currency; fmt: (usd: number | null | undefined, inr?: number | null, opts?: { compact?: boolean }) => string } {
  const [currency] = useCurrency();
  return {
    currency,
    fmt: (usd, inr, opts) => {
      if (currency === "INR" && inr !== null && inr !== undefined) return formatFiat(inr, "INR", opts);
      if (usd === null || usd === undefined) return "—";
      return formatFiat(usd, "USD", opts);
    },
  };
}

/** Big balance with the decimals dimmed, like a bank app. */
export function BigFiat({ value, currency, hidden, dim = "text-snow/35" }: { value: number; currency: Currency; hidden?: boolean; dim?: string }) {
  if (hidden) return <span className="tabular tracking-[-0.04em]">••••••</span>;
  const text = formatFiat(value, currency);
  const dot = text.lastIndexOf(".");
  const [head, tail] = dot > 0 ? [text.slice(0, dot), text.slice(dot)] : [text, ""];
  return (
    <span className="tabular tracking-[-0.04em]">
      {head}
      {tail && <span className={dim}>{tail}</span>}
    </span>
  );
}

const STATUS: Record<string, { label: string; cls: string; icon: typeof CircleCheck }> = {
  queued: { label: "Starting", cls: "text-muted", icon: Clock3 },
  converting: { label: "Converting", cls: "text-brand", icon: LoaderCircle },
  sending: { label: "Sending", cls: "text-brand", icon: LoaderCircle },
  done: { label: "Done", cls: "text-up", icon: CircleCheck },
  failed: { label: "Failed", cls: "text-down", icon: CircleX },
  review: { label: "Under review", cls: "text-gold", icon: TriangleAlert },
  open: { label: "Open", cls: "text-muted", icon: CircleDashed },
  pending: { label: "Waiting for payment", cls: "text-brand", icon: LoaderCircle },
  paid: { label: "Paid", cls: "text-up", icon: CircleCheck },
  cancelled: { label: "Cancelled", cls: "text-dim", icon: CircleX },
  expired: { label: "Expired", cls: "text-dim", icon: CircleX },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "text-muted", icon: CircleDashed };
  const Icon = s.icon;
  const spinning = status === "converting" || status === "sending" || status === "pending";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.cls}`}>
      <Icon size={13} className={spinning ? "animate-spin" : ""} aria-hidden="true" />
      {s.label}
    </span>
  );
}

// A clock that ticks once a minute, for "5m ago" labels without calling Date.now() in render.
let clockNow = 0;
function subscribeClock(cb: () => void) {
  const id = setInterval(() => {
    clockNow = Date.now();
    cb();
  }, 60_000);
  return () => clearInterval(id);
}
const readClock = () => (clockNow ||= Date.now());
export const useNow = () => useSyncExternalStore(subscribeClock, readClock, () => 0);

export function when(iso: string, now: number): string {
  const t = new Date(iso);
  if (!now) return t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const s = (now - t.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
