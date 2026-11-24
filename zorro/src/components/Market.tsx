"use client";

import { useEffect, useState } from "react";
import type { HistoryPoint, HistoryRange, Spot } from "@/lib/prices";
import { useCurrency } from "@/lib/client-prefs";
import { formatFiat, formatPct, timeAgo } from "@/lib/format";
import { PriceChart } from "./PriceChart";

const POLL_MS = 15_000;
const RANGES: { key: HistoryRange; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
];

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
    <section className="rounded-3xl border border-line bg-surface p-5" aria-labelledby="zec-price">
      <div className="flex items-start justify-between">
        <div>
          <h2 id="zec-price" className="text-sm text-muted">
            ZEC price
          </h2>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight">
            {price !== null ? formatFiat(price, currency) : spotError ? "—" : <Skeleton />}
          </p>
          <p className="tabular mt-1 text-sm text-muted">
            {otherPrice !== null && spot?.usdInr ? formatFiat(otherPrice, otherCurrency) : " "}
          </p>
        </div>
        <div className="flex rounded-full border border-line p-0.5 text-xs font-medium" role="group" aria-label="Currency">
          {(["INR", "USD"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              aria-pressed={currency === c}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                currency === c ? "bg-fox text-snow" : "text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        {change !== null && (
          <span
            className={`tabular rounded-full px-2 py-0.5 font-medium ${
              change >= 0 ? "bg-up/15 text-up" : "bg-down/15 text-down"
            }`}
          >
            {formatPct(change)}
          </span>
        )}
        <span className="text-muted">
          {spotError && !spot
            ? "Price unavailable. Retrying…"
            : spot && now !== null
              ? `via ${spot.source === "near-intents" ? "NEAR Intents" : "CoinGecko"} · ${timeAgo(spot.updatedAt, now)}`
              : "Loading…"}
        </span>
      </div>

      <div className="mt-4 -mx-1">
        <PriceChart points={chartPoints} multiplier={multiplier} showTime={range === "1d"} />
      </div>

      <div className="mt-3 flex gap-2" role="group" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
              range === r.key ? "bg-surface-2 text-snow" : "text-muted hover:text-snow"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return <span className="inline-block h-9 w-44 animate-pulse rounded-lg bg-surface-2 align-middle" />;
}
