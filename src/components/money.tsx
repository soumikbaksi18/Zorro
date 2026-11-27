"use client";

// Money display pieces shared by every screen.

import { useSyncExternalStore } from "react";
import { CircleCheck, CircleDashed, CircleX, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { findCoin, type Coin } from "@/lib/coins";
import { formatUsd } from "@/lib/format";

// Official coin and network logos from @web3icons/core (MIT), extracted to /public/coins and /public/chains.
const COIN_LOGO: Record<string, string> = { ZEC: "zec", USDC: "usdc", USDT: "usdt", SOL: "sol", ETH: "eth", BTC: "btc", NEAR: "near" };
const CHAIN_LOGO: Record<string, string> = { base: "base", arb: "arb", tron: "tron", sol: "sol", eth: "eth" };
/** The chain a coin natively lives on; a token elsewhere gets a small chain logo in the corner. */
const NATIVE_CHAIN: Record<string, string> = { ZEC: "zec", SOL: "sol", ETH: "eth", BTC: "btc", NEAR: "near" };

/** Round coin logo, with the chain's logo in the corner for tokens on several chains (USDC on Base…). */
export function CoinBadge({ coinKey, size = 36, showChain = true }: { coinKey: string; size?: number; showChain?: boolean }) {
  const c = findCoin(coinKey);
  const logo = c ? COIN_LOGO[c.symbol] : undefined;
  const chainLogo = c && NATIVE_CHAIN[c.symbol] !== c.chain ? CHAIN_LOGO[c.chain] : undefined;
  const mini = Math.max(12, Math.round(size * 0.44));
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs; next/image adds nothing here
        <img src={`/coins/${logo}.svg`} alt="" width={size} height={size} className="rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.6)]" />
      ) : (
        <span className="grid place-items-center rounded-full bg-surface-2 font-semibold" style={{ width: size, height: size, fontSize: size * 0.42 }}>
          {(c?.symbol ?? "?").slice(0, 1)}
        </span>
      )}
      {showChain && chainLogo && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs
        <img
          src={`/chains/${chainLogo}.svg`}
          alt=""
          width={mini}
          height={mini}
          className="absolute rounded-full ring-2 ring-ink"
          style={{ right: -mini * 0.22, bottom: -mini * 0.22, width: mini, height: mini }}
        />
      )}
    </span>
  );
}

export function coinName(c: Coin | undefined): string {
  if (!c) return "?";
  return c.kind === "zec" || c.symbol.toUpperCase() === c.chainName.toUpperCase() ? c.symbol : `${c.symbol} on ${c.chainName}`;
}

/** Amounts are shown in US dollars everywhere. */
export function useFiat(): { fmt: (usd: number | null | undefined, opts?: { compact?: boolean }) => string } {
  return { fmt: (usd, opts) => (usd === null || usd === undefined ? "—" : formatUsd(usd, opts)) };
}

/** Big balance with the decimals dimmed, like a bank app. */
export function BigFiat({ value, hidden, dim = "text-snow/35" }: { value: number; hidden?: boolean; dim?: string }) {
  if (hidden) return <span className="tabular tracking-[-0.04em]">••••••</span>;
  const text = formatUsd(value);
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
