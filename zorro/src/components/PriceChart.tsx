"use client";

import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { HistoryPoint } from "@/lib/prices";

type Props = {
  points: HistoryPoint[];
  multiplier: number; // USD -> display currency
  showTime: boolean;
};

export function PriceChart({ points, multiplier, showTime }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const latest = useRef({ points, multiplier, showTime });
  latest.current = { points, multiplier, showTime };

  // Create the chart once. lightweight-charts touches the DOM, so load it in the browser only.
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;

    (async () => {
      const { createChart, AreaSeries, ColorType } = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        height: 200,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#9b95a6",
          fontFamily: "inherit",
          attributionLogo: false,
        },
        grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        handleScroll: false,
        handleScale: false,
        crosshair: { vertLine: { labelVisible: false } },
      });
      const series = chart.addSeries(AreaSeries, {
        lineColor: "#b86ae6",
        lineWidth: 2,
        topColor: "rgba(138,63,200,0.40)",
        bottomColor: "rgba(138,63,200,0.02)",
        priceLineVisible: false,
      });
      chartRef.current = chart;
      seriesRef.current = series;
      applyData();

      observer = new ResizeObserver(([entry]) => chart.applyOptions({ width: entry.contentRect.width }));
      observer.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  function applyData() {
    const { points, multiplier, showTime } = latest.current;
    if (!seriesRef.current || !chartRef.current) return;
    // Whole rupees for INR, cents for USD.
    const precision = multiplier > 1 ? 0 : 2;
    seriesRef.current.applyOptions({
      priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision },
    });
    seriesRef.current.setData(
      points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value * multiplier })),
    );
    chartRef.current.applyOptions({ timeScale: { timeVisible: showTime, secondsVisible: false } });
    chartRef.current.timeScale().fitContent();
  }

  useEffect(applyData, [points, multiplier, showTime]);

  return <div ref={containerRef} className="h-[200px] w-full" aria-label="ZEC price chart" role="img" />;
}
