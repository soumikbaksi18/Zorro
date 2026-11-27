"use client";

import Link from "next/link";
import { useState } from "react";
import { AtSign, ChevronRight, LogOut, ShieldCheck, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api-client";
import { checkPaymentPermission, refreshAccount, signOut, useAccount } from "@/lib/account-client";
import { shortAddress } from "@/lib/addresses";
import { BrandMark } from "@/components/shell/Brand";
import { ErrorBox } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

export function AccountCard() {
  const account = useAccount();
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<string | null>(null);

  if (account.status === "loading") return <div className="panel h-40 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to Zorro" />;
  const { user, agent } = account.me;

  async function saveHandle() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/handle", { handle });
      await refreshAccount();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel-hero p-5">
        <div className="flex items-center gap-4">
          <BrandMark size={56} />
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{user.handle ? `@${user.handle}` : "No handle yet"}</p>
            <p className="text-sm text-muted">Signed in with your passkey · since {new Date(user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
          </div>
        </div>
        {editing ? (
          <div className="mt-4 flex flex-col gap-2">
            <span className="relative block">
              <AtSign size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                maxLength={20}
                placeholder="yourname"
                autoCapitalize="none"
                aria-label="Your handle"
                className="field pl-10 text-sm"
              />
            </span>
            {error && <ErrorBox message={error} />}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={saveHandle} disabled={busy || handle.length < 3} className="btn-primary">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setHandle(user.handle ?? "");
              setEditing(true);
            }}
            className="mt-4 text-sm text-brand hover:text-brand-light"
          >
            {user.handle ? "Change handle" : "Choose a handle so friends can pay you instantly"}
          </button>
        )}
      </section>

      <section className="panel divide-y divide-line" aria-label="Wallet">
        {agent ? (
          <>
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/12 text-brand">
                <Wallet size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Zorro wallet {agent.status === "ACTIVE" ? "· active" : `· ${agent.status.toLowerCase()}`}</p>
                <p className="truncate font-mono text-xs text-muted">{agent.nearAccountId ? shortAddress(agent.nearAccountId, 8) : agent.id}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 text-sm">
              <span className="text-muted">Daily payment limit</span>
              <span className="tabular">{agent.dailyLimitUsd ? `$${agent.dailyLimitUsd}` : "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 p-4 text-sm">
              <span className="text-muted">Payment permission</span>
              <span className="text-right">
                {agent.grant ? (agent.grant.revoked ? "Revoked" : `until ${new Date(agent.grant.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 p-4 text-sm">
              <button
                type="button"
                onClick={async () => setCheck((await checkPaymentPermission().catch(() => ({ ok: false, detail: "Check failed" }))).detail)}
                className="flex items-center gap-2 text-brand hover:text-brand-light"
              >
                <ShieldCheck size={15} aria-hidden="true" /> Test permission
              </button>
              {check && <span className="text-right text-xs text-muted">{check}</span>}
            </div>
            <Link href="/payees" className="flex items-center gap-3 p-4 text-sm hover:bg-white/3">
              <Users size={16} className="text-muted" aria-hidden="true" />
              <span className="flex-1">Approved payees</span>
              <ChevronRight size={16} className="text-dim" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <Link href="/wallet/setup" className="flex items-center gap-3 p-4 text-sm hover:bg-white/3">
            <Wallet size={16} className="text-brand" aria-hidden="true" />
            <span className="flex-1">Create your Zorro wallet</span>
            <ChevronRight size={16} className="text-dim" aria-hidden="true" />
          </Link>
        )}
        <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 p-4 text-left text-sm text-down hover:bg-white/3">
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </section>
    </>
  );
}
