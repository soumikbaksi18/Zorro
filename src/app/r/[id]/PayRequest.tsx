"use client";

import { useEffect, useState } from "react";
import { CircleCheck, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { coin } from "@/lib/coins";
import type { PublicRequest } from "@/lib/requests";
import { CoinPicker } from "@/components/CoinPicker";
import { coinName } from "@/components/money";
import { BrandMark } from "@/components/shell/Brand";
import { CopyButton, ErrorBox, QrCode } from "@/components/ui";

const amountText = (r: { amount: string; currency: string }) =>
  r.currency === "INR" ? `₹${Number(r.amount).toLocaleString("en-IN")}` : r.currency === "USD" ? `$${Number(r.amount).toLocaleString("en-US")}` : `${r.amount} ZEC`;

/** What someone sees when they open a Zorro payment link (no account needed). */
export function PayRequest({ id }: { id: string }) {
  const [req, setReq] = useState<PublicRequest | null>(null);
  const [coinKey, setCoinKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      api<PublicRequest>(`/api/requests/${encodeURIComponent(id)}`)
        .then((r) => {
          if (cancelled) return;
          setReq(r);
          if (r.status === "pending" || r.status === "open") timer = setTimeout(load, r.status === "pending" ? 8_000 : 30_000);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  async function choose() {
    if (!coinKey) return;
    setBusy(true);
    setError(null);
    try {
      setReq(await api<PublicRequest>(`/api/requests/${encodeURIComponent(id)}/pay`, { coinKey }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare the payment");
    } finally {
      setBusy(false);
    }
  }

  if (error && !req) return <ErrorBox message={error} />;
  if (!req) return <div className="panel h-72 animate-pulse" />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <BrandMark size={40} />
        <div>
          <p className="text-sm text-muted">Payment request from</p>
          <p className="font-semibold">{req.to}</p>
        </div>
      </header>

      <section className="glass-card p-6">
        <p className="text-sm font-medium text-brand-ink/70">{req.note ?? "Amount"}</p>
        <p className="tabular mt-1 text-[44px] leading-none font-semibold tracking-[-0.04em]">{amountText(req)}</p>
        {req.usd !== null && req.currency !== "USD" && <p className="tabular mt-2 text-sm text-brand-ink/70">≈ ${req.usd.toFixed(2)}</p>}
      </section>

      {req.status === "paid" ? (
        <section className="panel-hero p-6 text-center" aria-live="polite">
          <CircleCheck size={40} className="mx-auto text-up" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-semibold">Paid. Thank you!</h1>
          <p className="mt-1 text-sm text-muted">{req.to} has received it.</p>
        </section>
      ) : req.status === "cancelled" || req.status === "expired" ? (
        <p className="panel p-5 text-sm text-muted">This link is no longer active.</p>
      ) : req.deposit ? (
        <Deposit req={req} onChange={() => setReq({ ...req, deposit: null, status: "open" })} />
      ) : (
        <section className="flex flex-col gap-4" aria-labelledby="pick-heading">
          <h1 id="pick-heading" className="section-title">
            Pay with any of these
          </h1>
          <CoinPicker value={coinKey} onChange={setCoinKey} label="Coin to pay with" amounts={Object.fromEntries(req.coins.map((c) => [c.key, c.amount]))} />
          {error && <ErrorBox message={error} />}
          <button type="button" onClick={choose} disabled={!coinKey || busy} className="btn-primary w-full">
            {busy ? "Preparing…" : coinKey ? `Pay with ${coinName(coin(coinKey))}` : "Choose a coin"}
          </button>
        </section>
      )}

      <p className="flex gap-2 text-xs leading-relaxed text-dim">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        Powered by NEAR Intents. Your payment converts to ZEC on arrival. Zorro never sees your wallet or keys.
      </p>
    </div>
  );
}

function Deposit({ req, onChange }: { req: PublicRequest; onChange: () => void }) {
  const d = req.deposit!;
  const c = coin(d.coinKey);
  return (
    <section className="panel-hero flex flex-col items-center gap-4 p-5 text-center" aria-live="polite">
      <p className="text-sm">
        Send exactly{" "}
        <strong className="tabular font-semibold">
          {d.amount} {c.symbol}
        </strong>{" "}
        on {c.chainName}
      </p>
      <QrCode value={d.uri ?? d.address} size={200} />
      <p className="w-full rounded-2xl border border-line bg-ink px-3 py-3 font-mono text-[13px] break-all">{d.address}</p>
      {d.memo && <p className="w-full rounded-2xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">Memo (required): {d.memo}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <CopyButton value={d.address} label="Copy address" />
        <CopyButton value={d.amount} label="Copy amount" />
        {d.uri && (
          <a href={d.uri} className="shrink-0 rounded-full bg-brand px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-brand-ink uppercase">
            Open wallet
          </a>
        )}
      </div>
      <p className="flex items-center gap-2 text-sm text-brand">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" /> Waiting for your payment…
      </p>
      <ul className="w-full text-left text-xs leading-relaxed text-muted">
        <li>• Only send {coinName(c)}. Other coins or chains are lost.</li>
        <li>• Send the exact amount; less isn&apos;t credited and is refunded.</li>
        {d.expiresAt && <li>• Pay before {new Date(d.expiresAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</li>}
      </ul>
      <button type="button" onClick={onChange} className="text-sm text-muted underline underline-offset-4 hover:text-snow">
        Use a different coin
      </button>
    </section>
  );
}
