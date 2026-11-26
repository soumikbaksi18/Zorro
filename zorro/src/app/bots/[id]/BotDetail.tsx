"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Square, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import type { BotDetail as Detail } from "@/lib/bots/service";
import { BOT_STATUS_TONE } from "@/components/bots/MyBots";

const ORDER_TONE: Record<string, string> = {
  open: "bg-fox/20 text-fox-light",
  partially_filled: "bg-gold/15 text-gold",
  filled: "bg-up/15 text-up",
  placing: "bg-gold/15 text-gold",
  failed: "bg-down/15 text-down",
};

const LEVEL_TONE: Record<string, string> = {
  trade: "border-fox/50 bg-fox/10",
  error: "border-down/40 bg-down/10",
  warn: "border-gold/40 bg-gold/10",
  info: "border-line bg-panel",
};

export function BotDetail({ id }: { id: string }) {
  const [bot, setBot] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/bots/${encodeURIComponent(id)}`);
      setBot(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the bot");
    }
    setNow(Date.now());
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => !cancelled && void load();
    tick();
    const timer = setInterval(tick, 8_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  async function act(action: "pause" | "resume" | "stop") {
    if (action === "stop" && !confirm("Stop this bot for good? A trade already sent will still settle.")) return;
    setBusy(true);
    try {
      await api(`/api/bots/${encodeURIComponent(id)}`, { action });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!bot) return error ? <p className="panel p-5 text-sm text-down">{error}</p> : <div className="panel h-64 animate-pulse" />;

  const workerStale = !bot.workerSeenAt || (now !== null && now - new Date(bot.workerSeenAt).getTime() > 90_000);
  const s = bot.state;
  const avg = (s.boughtZec ?? 0) > 0 ? (s.spentUsd ?? 0) / s.boughtZec! : null;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/bots" className="eyebrow hover:text-fox-light">
          ← Bots
        </Link>
        <h1 className="page-title mt-3">{bot.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${BOT_STATUS_TONE[bot.status] ?? ""}`}>{bot.status}</span>
          <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.1em] uppercase ${bot.mode === "live" ? "bg-fox/20 text-fox-light" : "bg-surface-2 text-muted"}`}>
            {bot.mode === "live" ? "Live" : "Paper · no money moves"}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-snow/85">{bot.description}.</p>
      </header>

      {bot.status === "active" && workerStale && (
        <p className="flex gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs text-gold">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          The bot worker isn&apos;t running, so this bot is paused in practice. Start it with npm run worker.
        </p>
      )}

      <section className="panel-hero p-5">
        <div className="flex items-center justify-between">
          <p className="eyebrow">ZEC price</p>
          {bot.price?.source === "demo" && <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[9px] tracking-[0.1em] text-gold uppercase">Demo price</span>}
        </div>
        <p className="tabular mt-2 text-[34px] leading-none font-light tracking-[-0.03em]">{bot.price ? `$${bot.price.priceUsd.toFixed(2)}` : "—"}</p>

        {bot.trigger && !s.completedAt && (
          <dl className="tabular mt-4 text-sm">
            <Row label={bot.kind === "trailing_stop" ? "Sells at (moves up with the peak)" : "Sells at"} value={`$${bot.trigger.triggerUsd.toFixed(2)}`} />
            <Row label="Room before it sells" value={bot.trigger.pct > 0 ? `${bot.trigger.pct.toFixed(1)}%` : "Triggered"} />
            {bot.kind === "trailing_stop" && s.peakUsd && <Row label="Peak seen" value={`$${s.peakUsd.toFixed(2)}`} />}
          </dl>
        )}
        {bot.kind === "smart_dca" && (
          <dl className="tabular mt-4 text-sm">
            <Row label="Buys so far" value={String(s.buys ?? 0)} />
            <Row label="Spent" value={`$${(s.spentUsd ?? 0).toFixed(2)}`} />
            <Row label="ZEC bought" value={(s.boughtZec ?? 0).toFixed(5)} />
            {avg && <Row label="Average price" value={`$${avg.toFixed(2)}`} />}
            {s.nextRunAt && !s.completedAt && (
              <Row label="Next buy" value={new Date(s.nextRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} />
            )}
          </dl>
        )}
        {(bot.kind === "tp_ladder" || bot.kind === "grid") && s.orders && (
          <div className="mt-4">
            {bot.kind === "grid" && (
              <dl className="tabular mb-3 text-sm">
                <Row label="Round trips" value={String(s.roundTrips ?? 0)} />
                <Row label="Profit booked (before fees)" value={`$${(s.realizedUsd ?? 0).toFixed(2)}`} />
              </dl>
            )}
            <p className="eyebrow mb-2">Orders</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-ink/50">
              {[...s.orders]
                .filter((o) => o.status !== "canceled" || bot.status === "stopped")
                .sort((a, b) => b.priceUsd - a.priceUsd)
                .map((o) => (
                  <li key={o.key} className="tabular flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      <span className={o.side === "sell" ? "text-up" : "text-fox-light"}>{o.side === "sell" ? "Sell" : "Buy"}</span>{" "}
                      {Number(o.quantity) / 1e8} ZEC
                    </span>
                    <span className="text-right">
                      ${o.priceUsd.toFixed(2)}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${ORDER_TONE[o.status] ?? "bg-surface-2 text-muted"}`}>
                        {o.status.replace("_", " ")}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {s.completedAt && (
          <p className="mt-4 text-sm text-up">
            Finished {new Date(s.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {s.soldZec ? ` · sold ${s.soldZec} ZEC for ~$${(s.receivedUsd ?? 0).toFixed(2)}` : ""}
          </p>
        )}
        {s.inFlight && <p className="mt-4 text-sm text-gold">A trade is settling on NEAR Intents…</p>}
        {s.lastError && bot.status === "paused" && <p className="mt-4 text-sm text-down">Paused: {s.lastError.replaceAll("_", " ")}</p>}
      </section>

      {bot.status !== "stopped" && (
        <div className="grid grid-cols-2 gap-2.5">
          {bot.status === "active" ? (
            <button type="button" onClick={() => act("pause")} disabled={busy} className="btn-secondary min-h-11 text-[13px]">
              <Pause size={15} /> Pause
            </button>
          ) : (
            <button type="button" onClick={() => act("resume")} disabled={busy || Boolean(s.completedAt)} className="btn-primary min-h-11 text-[13px]">
              <Play size={15} /> Resume
            </button>
          )}
          <button type="button" onClick={() => act("stop")} disabled={busy} className="btn-secondary min-h-11 border-down/40 text-[13px] text-down">
            <Square size={14} /> Stop
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-down">{error}</p>}

      <section aria-labelledby="log-heading">
        <h2 id="log-heading" className="eyebrow mb-3">
          Activity log
        </h2>
        <ol className="flex flex-col gap-2">
          {bot.events.map((e, i) => (
            <li key={e.at + i} className={`rounded-xl border px-3 py-2.5 ${LEVEL_TONE[e.level] ?? LEVEL_TONE.info}`}>
              <p className="text-sm leading-relaxed">{e.message}</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
                {e.level} · {new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
