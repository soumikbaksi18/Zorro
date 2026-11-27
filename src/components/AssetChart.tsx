"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { AssetChart as Chart, ChartAsset, ChartRange } from "@/lib/history";
import { CoinBadge } from "./money";

const LOGO_KEY: Record<ChartAsset, string> = { ZEC: "zec", BTC: "btc", ETH: "eth", SOL: "sol", NEAR: "near" };
const RANGES: ChartRange[] = ["1d", "7d", "30d", "90d"];
const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 2 : 4 })}`;

/** Price card with a lime area chart; the range chips refetch. */
export function AssetChart({ asset, range: initialRange }: { asset: ChartAsset; range: ChartRange }) {
  const [range, setRange] = useState(initialRange);
  const [chart, setChart] = useState<{ key: string; data: Chart } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const key = `${asset}:${range}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assistant/chart?asset=${asset}&range=${range}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Chart unavailable");
        return d as Chart;
      })
      .then((d) => !cancelled && setChart({ key: `${asset}:${range}`, data: d }))
      .catch((e: Error) => !cancelled && setError({ key: `${asset}:${range}`, message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [asset, range]);

  const data = chart?.key === key ? chart.data : null;
  const err = error?.key === key ? error.message : null;
  const W = 300;
  const H = 120;
  let path = "";
  let area = "";
  if (data) {
    const vs = data.points.map((p) => p.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const pts = data.points.map((p, i) => [(i / (data.points.length - 1)) * W, 6 + (1 - (p.v - min) / span) * (H - 12)]);
    path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    area = `${path} L${W} ${H} L0 ${H} Z`;
  }
  const up = (data?.changePct ?? 0) >= 0;

  return (
    <figure className="panel m-0 p-4">
      <figcaption className="flex items-center gap-2.5">
        <CoinBadge coinKey={LOGO_KEY[asset]} size={30} showChain={false} />
        <span className="flex-1">
          <span className="block text-sm font-semibold">{asset}</span>
          <span className="tabular block text-xs text-snow/60">{data ? usd(data.last) : "…"}</span>
        </span>
        {data && (
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-brand/15 text-brand" : "bg-down/15 text-down"}`}>
            {up ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
            {up ? "+" : ""}
            {data.changePct.toFixed(2)}%
          </span>
        )}
      </figcaption>
      <div className="mt-3 h-[120px]">
        {data ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`${asset} price over ${range}: ${usd(data.first)} to ${usd(data.last)}, high ${usd(data.high)}, low ${usd(data.low)}`}>
            <defs>
              <linearGradient id={`fill-${asset}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? "#b8f36b" : "#ff6b6b"} stopOpacity="0.35" />
                <stop offset="100%" stopColor={up ? "#b8f36b" : "#ff6b6b"} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#fill-${asset})`} />
            <path d={path} fill="none" stroke={up ? "#b8f36b" : "#ff6b6b"} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        ) : err ? (
          <p className="grid h-full place-items-center text-xs text-snow/50">{err}</p>
        ) : (
          <div className="h-full animate-pulse rounded-xl bg-white/5" />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="tabular text-[11px] text-snow/50">{data ? `H ${usd(data.high)} · L ${usd(data.low)}` : ""}</span>
        <span className="flex gap-1" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${range === r ? "bg-brand text-brand-ink" : "text-snow/60 hover:text-snow"}`}
            >
              {r}
            </button>
          ))}
        </span>
      </div>
    </figure>
  );
}
