"use client";

import type { PaymentView } from "@/lib/payments";

const IST = 330 * 60_000;
const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t + IST).toISOString().slice(0, 10);

/** Smooth line through points (Catmull-Rom → cubic Bézier). */
function smooth(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/**
 * Last 7 days of money in or out, as a smooth line with the biggest day highlighted
 * (lime bar + value bubble). `now` comes from a ticking clock so render stays pure.
 */
export function SpendChart({
  payments,
  mode,
  now,
  format,
}: {
  payments: PaymentView[];
  mode: "in" | "out";
  now: number;
  format: (v: number) => string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => now - (6 - i) * DAY);
  const totals = days.map((t) => {
    const key = dayKey(t);
    return payments
      .filter((p) => p.status === "done" && p.direction === mode && dayKey(new Date(p.completedAt ?? p.createdAt).getTime()) === key)
      .reduce((s, p) => s + (p.usd ?? 0), 0);
  });
  const max = Math.max(...totals);
  const top = max > 0 ? max * 1.25 : 1;
  const peak = max > 0 ? totals.indexOf(max) : 6;

  const W = 320;
  const H = 170;
  const left = 34;
  const bottom = 24;
  const x = (i: number) => left + (i * (W - left - 10)) / 6;
  const y = (v: number) => 10 + (1 - v / top) * (H - bottom - 10);
  const points = totals.map((v, i) => [x(i), y(v)] as [number, number]);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const short = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : Math.round(v).toString());
  const sym = "$";

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${mode === "out" ? "Spending" : "Income"} over the last 7 days, highest ${format(max)}`}>
        <defs>
          <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b8f36b" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#b8f36b" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g}>
            <line x1={left} x2={W - 6} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
            <text x={left - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="rgba(242,247,239,0.55)">
              {sym}
              {short(g)}
            </text>
          </g>
        ))}
        <rect x={x(peak) - 13} y={y(totals[peak])} width={26} height={Math.max(0, H - bottom - y(totals[peak]))} rx={6} fill="url(#bar)" />
        <path d={smooth(points)} fill="none" stroke="#b8f36b" strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={x(peak)} cy={y(totals[peak])} r={4.5} fill="#070b08" stroke="#b8f36b" strokeWidth={2.4} />
        {max > 0 && (
          <g>
            <rect x={Math.min(W - 82, Math.max(left, x(peak) - 38))} y={Math.max(0, y(totals[peak]) - 34)} width={76} height={26} rx={7} fill="#d9f7a8" />
            <text x={Math.min(W - 82, Math.max(left, x(peak) - 38)) + 38} y={Math.max(0, y(totals[peak]) - 34) + 17} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0b1607">
              {mode === "out" ? "−" : "+"}
              {format(max)}
            </text>
          </g>
        )}
        {days.map((t, i) => (
          <text key={t} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill={i === peak ? "#b8f36b" : "rgba(242,247,239,0.55)"} fontWeight={i === peak ? 700 : 400}>
            {new Date(t + IST).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}
          </text>
        ))}
      </svg>
    </figure>
  );
}
