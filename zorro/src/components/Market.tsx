"use client";

import { useEffect, useState } from "react";
import type { HistoryPoint, HistoryRange, Spot } from "@/lib/prices";
import { useCurrency } from "@/lib/client-prefs";
import { formatFiat, formatPct, timeAgo } from "@/lib/format";
import { PriceChart } from "./PriceChart";
import { QuickActions } from "./QuickActions";

const POLL_MS = 15_000;
const RANGES: { key: HistoryRange; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
];

/** The home hero: live ZEC price, chart and quick actions (after Zeno's portfolio card). */
export function Market() {
  const [currency, setCurrency] = useCurrency();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [spotError, setSpotError] = useState(false);
  const [range, setRange] = useState<HistoryRange>("1d");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [now, setNow] = useState<number | null>(null); // set after each poll, never during prerender

  // Live price, polled while the app is visible.
  useEffect(() => {
    let cancelled = false;
    async function load(force = false) {
      // Always load once on mount; after that, only poll while the app is on screen.
      if (!force && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/price");
        if (!res.ok) throw new Error();
        const data: Spot = await res.json();
        if (!cancelled) {
          setSpot(data);
          setSpotError(false);
        }
      } catch {
        if (!cancelled) setSpotError(true);
      }
      if (!cancelled) setNow(Date.now());
    }
    const poll = () => load();
    load(true);
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  // Chart history for the selected range.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/price/history?range=${range}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: HistoryPoint[]) => !cancelled && setHistory(data))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const multiplier = currency === "INR" && spot?.usdInr ? spot.usdInr : 1;
  // Never draw USD values under an INR label: wait for the exchange rate first.
  const chartPoints = currency === "USD" || spot?.usdInr ? history : [];
  const price = spot ? spot.zecUsd * multiplier : null;
  const otherCurrency = currency === "INR" ? "USD" : "INR";
  const otherPrice = spot ? (currency === "INR" ? spot.zecUsd : spot.zecUsd * spot.usdInr) : null;

  // Change over the visible chart range, so the number matches what the chart shows.
  const rangeChange =
    history.length > 1 ? ((history.at(-1)!.value - history[0].value) / history[0].value) * 100 : null;
  const change = range === "1d" ? (spot?.change24hPct ?? rangeChange) : rangeChange;

  return (
    <section className="panel-hero p-5" aria-labelledby="zec-price">
      <div className="flex items-start justify-between gap-3">
        <h2 id="zec-price" className="eyebrow">
          ZEC price
        </h2>
        <div className="flex rounded-full border border-line p-0.5 font-mono text-[10px] tracking-[0.1em]" role="group" aria-label="Currency">
          {(["INR", "USD"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={`rounded-full px-2.5 py-1 transition-colors ${currency === c ? "bg-fox text-snow" : "text-muted hover:text-snow"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="tabular mt-3 text-[44px] leading-none font-light tracking-[-0.03em]">
        {price !== null ? formatFiat(price, currency) : spotError ? "—" : <Skeleton />}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {otherPrice !== null && spot?.usdInr ? (
          <span className="tabular text-muted">{formatFiat(otherPrice, otherCurrency)}</span>
        ) : null}
        {change !== null && (
          <span
            className={`tabular rounded-full px-2 py-0.5 text-xs font-medium ${
              change >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"
            }`}
          >
            {formatPct(change)}
          </span>
        )}
        <span className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">
          {spotError && !spot
            ? "Price unavailable · retrying"
            : spot && now !== null
              ? `via ${spot.source === "near-intents" ? "NEAR Intents" : "CoinGecko"} · ${timeAgo(spot.updatedAt, now)}`
              : "Loading"}
        </span>
      </div>

      <div className="-mx-1 mt-5">
        <PriceChart points={chartPoints} multiplier={multiplier} showTime={range === "1d"} />
      </div>

      <div className="tabs mt-2" role="group" aria-label="Chart range">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={range === r.key} className="tab">
            {r.label}
          </button>
        ))}
      </div>

      <QuickActions />
    </section>
  );
}

function Skeleton() {
  return <span className="inline-block h-11 w-52 animate-pulse rounded-lg bg-surface-2 align-middle" />;
}
