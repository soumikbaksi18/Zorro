"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AtSign, Fingerprint, Plus, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api-client";
import { preparePayeeApproval, signPayeeApproval, useAccount, type PreparedApproval } from "@/lib/account-client";
import { shortAddress } from "@/lib/addresses";
import { coin, findCoin, isValidAddress } from "@/lib/coins";
import type { PayeeView } from "@/lib/payees";
import { CoinPicker } from "@/components/CoinPicker";
import { PayeeAvatar } from "@/components/PayeeAvatar";
import { coinName } from "@/components/money";
import { ErrorBox, Segmented } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

export function PayeesManager() {
  const account = useAccount();
  const params = useSearchParams();
  const prefill = { name: params.get("name") ?? "", coin: params.get("coin") ?? "", address: params.get("address") ?? "" };
  const [payees, setPayees] = useState<PayeeView[] | null>(null);
  const [adding, setAdding] = useState(Boolean(prefill.address));
  const [approving, setApproving] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedApproval | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  const load = useCallback(
    () =>
      api<PayeeView[]>("/api/payees")
        .then(setPayees)
        .catch((e: Error) => setMessage({ kind: "error", text: e.message })),
    [],
  );
  useEffect(() => {
    if (hasWallet) void load();
  }, [hasWallet, load]);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to manage payees" />;
  if (!hasWallet) {
    return (
      <div className="panel p-5 text-sm">
        Create your wallet first.{" "}
        <Link href="/wallet/setup" className="text-brand">
          Create wallet
        </Link>
      </div>
    );
  }

  const approved = payees?.filter((p) => p.status === "approved") ?? [];
  const waiting = payees?.filter((p) => p.status === "pending" || p.status === "approving") ?? [];

  // Two taps: prepare (talks to NEAR Intents), then Face ID. Safari only opens Face ID when it's
  // asked right after a tap, so the passkey prompt never waits on the network.
  const ready = prepared && prepared.count === waiting.length ? prepared : null;

  async function prepare() {
    setMessage(null);
    setApproving("Preparing your new rules…");
    try {
      setPrepared(await preparePayeeApproval());
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't prepare the approval" });
    } finally {
      setApproving(null);
    }
  }

  async function approve(p: PreparedApproval) {
    setMessage(null);
    try {
      const r = await signPayeeApproval(p, setApproving);
      setPrepared(null);
      if (r.status === "APPROVED") setMessage({ kind: "ok", text: `Approved ${r.count} payee${r.count === 1 ? "" : "s"}. You can pay them now.` });
      else if (r.status === "FAILED") setMessage({ kind: "error", text: `NEAR Intents didn't apply it (${r.reason}). Nothing changed.` });
      else setMessage({ kind: "ok", text: "Still confirming on NEAR. Check again in a minute." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Approval failed" });
    } finally {
      setApproving(null);
      void load();
    }
  }

  async function remove(p: PayeeView) {
    if (!confirm(`Remove ${p.name}? Zorro stops paying them now; the address leaves your signed rules at your next approval.`)) return;
    await api(`/api/payees/${p.id}`, undefined, "DELETE").catch(() => {});
    void load();
  }

  return (
    <div className="flex flex-col gap-6">
      {message && (message.kind === "error" ? <ErrorBox message={message.text} /> : <p className="rounded-2xl border border-up/40 bg-up/10 px-4 py-3 text-sm text-up">{message.text}</p>)}

      {waiting.length > 0 && (
        <section className="panel-hero p-5" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading" className="section-title">
            Waiting for approval
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {waiting.map((p) => (
              <PayeeRow key={p.id} p={p} onRemove={() => remove(p)} />
            ))}
          </ul>
          <button type="button" onClick={() => (ready ? approve(ready) : prepare())} disabled={approving !== null} className="btn-primary mt-5 w-full">
            <Fingerprint size={17} aria-hidden="true" />
            {approving ?? (ready ? "Confirm with Face ID" : `Approve ${waiting.length} with Face ID`)}
          </button>
          <p className="mt-2 text-center text-xs text-dim">
            {ready ? `Ready: one Face ID approves all ${ready.count}.` : "One signature approves them all."} NEAR Intents allows one rules change every 10 minutes.
          </p>
        </section>
      )}

      {adding ? (
        <AddPayee
          prefill={prefill}
          onDone={(added) => {
            setAdding(false);
            if (added) setMessage({ kind: "ok", text: added.status === "approved" ? `${added.name} is ready to pay.` : `${added.name} added. Approve with Face ID to start paying them.` });
            void load();
          }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary w-full">
          <Plus size={17} aria-hidden="true" /> Add a payee
        </button>
      )}

      <section aria-labelledby="approved-heading">
        <h2 id="approved-heading" className="section-title mb-3">
          Approved
        </h2>
        {payees === null ? (
          <div className="panel h-24 animate-pulse" />
        ) : approved.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">No approved payees yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {approved.map((p) => (
              <PayeeRow key={p.id} p={p} onRemove={() => remove(p)} payLink />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PayeeRow({ p, onRemove, payLink }: { p: PayeeView; onRemove: () => void; payLink?: boolean }) {
  return (
    <li className="panel flex items-center gap-3 p-3">
      <PayeeAvatar name={p.name} coinKey={p.coinKey} size={42} />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[15px] font-medium">{p.name}</strong>
        <span className="block truncate text-xs text-muted">
          {coinName(findCoin(p.coinKey))} · {p.kind === "zorro" ? `@${p.handle}` : shortAddress(p.address, 6)}
        </span>
      </span>
      {payLink && (
        <Link href={`/pay?to=${p.id}`} className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-ink">
          Pay
        </Link>
      )}
      <button type="button" onClick={onRemove} aria-label={`Remove ${p.name}`} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white/6 hover:text-down">
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function AddPayee({ prefill, onDone }: { prefill: { name: string; coin: string; address: string }; onDone: (added: PayeeView | null) => void }) {
  const [kind, setKind] = useState<"address" | "zorro">("address");
  const [name, setName] = useState(prefill.name);
  const [coinKey, setCoinKey] = useState(findCoin(prefill.coin) ? prefill.coin : "usdc-base");
  const [address, setAddress] = useState(prefill.address);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = coin(coinKey);
  const addrOk = !address.trim() || isValidAddress(c.kind, address.trim());
  const canSave = kind === "address" ? name.trim() && address.trim() && addrOk : /^@?[a-z0-9_]{3,20}$/i.test(handle.trim());

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = kind === "address" ? { kind, name: name.trim(), coinKey, address: address.trim() } : { kind, name: name.trim() || undefined, handle: handle.trim(), coinKey };
      onDone(await api<PayeeView>("/api/payees", body));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the payee");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel flex flex-col gap-5 p-5" aria-labelledby="add-heading">
      <h2 id="add-heading" className="section-title">
        New payee
      </h2>
      <Segmented
        label="Payee type"
        value={kind}
        onChange={setKind}
        options={[
          { value: "address", label: "Wallet address" },
          { value: "zorro", label: "Zorro user" },
        ]}
      />
      {kind === "zorro" ? (
        <>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Their @handle</span>
            <span className="relative block">
              <AtSign size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="arjun" autoCapitalize="none" spellCheck={false} className="field pl-10 text-sm" />
            </span>
            <span className="mt-2 block text-xs text-muted">Zorro-to-Zorro payments are instant and private, with no network fee.</span>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Name <span className="font-normal text-muted">· optional</span>
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Arjun" className="field text-sm" />
          </label>
        </>
      ) : (
        <>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya, Landlord, Coffee shop" className="field text-sm" />
          </label>
          <div>
            <p className="mb-2 text-sm font-medium">They receive</p>
            <CoinPicker value={coinKey} onChange={setCoinKey} label="Coin they receive" />
          </div>
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Wallet size={15} aria-hidden="true" /> Their {c.chainName} address
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={c.kind === "evm" ? "0x…" : c.kind === "zec" ? "t1… or u1…" : `${c.chainName} address`}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!addrOk}
              className="field font-mono text-sm"
            />
            {!addrOk && <span className="mt-2 block text-xs text-down">That isn&apos;t a valid {c.chainName} address.</span>}
            <span className="mt-2 block text-xs text-muted">They&apos;ll receive {coinName(c)}. Double-check it: payments can&apos;t be reversed.</span>
          </label>
        </>
      )}
      {error && <ErrorBox message={error} />}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => onDone(null)} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!canSave || busy} className="btn-primary">
          {busy ? "Adding…" : "Add payee"}
        </button>
      </div>
    </section>
  );
}
