"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { HandCoins, Share2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { useCurrency } from "@/lib/client-prefs";
import type { RequestView } from "@/lib/requests";
import { StatusBadge, useNow, when } from "@/components/money";
import { CopyButton, ErrorBox, QrCode, Segmented } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

const noSubscribe = () => () => {};
const useOrigin = () => useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");

export const requestAmount = (r: { amount: string; currency: string }) =>
  r.currency === "INR" ? `₹${Number(r.amount).toLocaleString("en-IN")}` : r.currency === "USD" ? `$${Number(r.amount).toLocaleString("en-US")}` : `${r.amount} ZEC`;

export function RequestsManager() {
  const account = useAccount();
  const [pref] = useCurrency();
  const origin = useOrigin();
  const now = useNow();
  const [requests, setRequests] = useState<RequestView[] | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"INR" | "USD" | "ZEC">(pref);
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<RequestView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  const load = useCallback(
    () =>
      api<RequestView[]>("/api/requests")
        .then(setRequests)
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    if (!hasWallet) return;
    void load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [hasWallet, load]);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to request money" />;
  if (!hasWallet) {
    return (
      <div className="panel p-5 text-sm">
        Create your wallet first.{" "}
        <Link href="/wallet/setup" className="text-zec">
          Create wallet
        </Link>
      </div>
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setCreated(await api<RequestView>("/api/requests", { amount, currency, note: note.trim() || undefined }));
      setAmount("");
      setNote("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the link");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(r: RequestView) {
    if (!confirm("Cancel this link? Nobody will be able to pay it.")) return;
    await api(`/api/requests/${r.id}`, undefined, "DELETE").catch(() => {});
    if (created?.id === r.id) setCreated(null);
    void load();
  }

  const linkFor = (r: RequestView) => `${origin}/r/${r.id}`;
  async function share(r: RequestView) {
    const url = linkFor(r);
    const text = `Pay me ${requestAmount(r)}${r.note ? ` for ${r.note}` : ""} with Zorro (any coin works):`;
    if (navigator.share) await navigator.share({ title: "Zorro payment link", text, url }).catch(() => {});
    else await navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <section className="panel-hero flex flex-col items-center gap-4 p-5 text-center" aria-live="polite">
          <p className="text-sm text-muted">Your link for</p>
          <p className="tabular -mt-2 text-[34px] font-semibold tracking-[-0.03em]">{requestAmount(created)}</p>
          {created.note && <p className="-mt-3 text-sm">{created.note}</p>}
          <QrCode value={linkFor(created)} size={180} />
          <p className="w-full rounded-2xl border border-line bg-ink px-3 py-2.5 font-mono text-xs break-all">{linkFor(created)}</p>
          <div className="grid w-full grid-cols-2 gap-2.5">
            <button type="button" onClick={() => share(created)} className="btn-primary">
              <Share2 size={16} aria-hidden="true" /> Share
            </button>
            <button type="button" onClick={() => setCreated(null)} className="btn-secondary">
              Done
            </button>
          </div>
          <CopyButton value={linkFor(created)} label="Copy link" />
        </section>
      ) : (
        <section className="panel flex flex-col gap-4 p-5" aria-labelledby="new-req-heading">
          <h2 id="new-req-heading" className="section-title flex items-center gap-2">
            <HandCoins size={18} className="text-zec" aria-hidden="true" /> New link
          </h2>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Amount</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="field tabular text-lg font-semibold" />
          </label>
          <Segmented
            label="Currency"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "INR", label: "₹ INR" },
              { value: "USD", label: "$ USD" },
              { value: "ZEC", label: "ZEC" },
            ]}
          />
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              What for <span className="font-normal text-muted">· shown to the payer</span>
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Logo design, Dinner split" className="field text-sm" />
          </label>
          {error && <ErrorBox message={error} />}
          <button type="button" onClick={create} disabled={!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0 || busy} className="btn-primary w-full">
            {busy ? "Creating…" : "Create link"}
          </button>
          <p className="text-xs leading-relaxed text-dim">The payer sees the amount, your note and your @handle (if you set one), never your balance.</p>
        </section>
      )}

      <section aria-labelledby="links-heading">
        <h2 id="links-heading" className="section-title mb-3">
          Your links
        </h2>
        {requests === null ? (
          <div className="panel h-24 animate-pulse" />
        ) : requests.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">No links yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {requests.map((r) => (
              <li key={r.id} className="panel flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <strong className="tabular block font-semibold">{requestAmount(r)}</strong>
                  <span className="block truncate text-xs text-muted">
                    {r.note ? `${r.note} · ` : ""}
                    {when(r.createdAt, now)}
                  </span>
                </div>
                <StatusBadge status={r.status} />
                {(r.status === "open" || r.status === "pending") && (
                  <>
                    <button type="button" onClick={() => share(r)} aria-label="Share link" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white/6 hover:text-snow">
                      <Share2 size={16} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => cancel(r)} aria-label="Cancel link" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white/6 hover:text-down">
                      <X size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
