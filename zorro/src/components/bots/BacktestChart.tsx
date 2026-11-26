"use client";

import { useEffect, useRef } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import type { BacktestTrade, PricePoint } from "@/lib/bots/backtest";

/** Price history with the backtest's buys (green, below) and sells (red, above). */
export function BacktestChart({ points, trades }: { points: PricePoint[]; trades: BacktestTrade[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const { createChart, createSeriesMarkers, LineSeries, ColorType } = await import("lightweight-charts");
      if (disposed || !ref.current) return;
      const chart = createChart(ref.current, {
        height: 170,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9b95a6", fontFamily: "inherit", attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        handleScroll: false,
        handleScale: false,
      });
      const series = chart.addSeries(LineSeries, { color: "#b86ae6", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      createSeriesMarkers(
        series,
        trades.map((t) => ({
          time: t.time as UTCTimestamp,
          position: t.side === "sell" ? ("aboveBar" as const) : ("belowBar" as const),
          shape: t.side === "sell" ? ("arrowDown" as const) : ("arrowUp" as const),
          color: t.side === "sell" ? "#f05d6c" : "#6cc24a",
        })),
      );
      chart.timeScale().fitContent();
      const observer = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
      observer.observe(ref.current);
      cleanup = () => {
        observer.disconnect();
        chart.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [points, trades]);

  return <div ref={ref} className="h-[170px] w-full" role="img" aria-label="ZEC price with the backtest's buys and sells" />;
}
