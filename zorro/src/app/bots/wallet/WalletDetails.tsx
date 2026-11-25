"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Wallet } from "lucide-react";
import { shortAddress } from "@/lib/addresses";
import { checkBotPermission, signOut, useAccount } from "@/lib/account-client";
import { CopyButton } from "@/components/ui";
import { PasskeyGate } from "@/components/bots/PasskeyGate";

const CHAIN_LABEL: Record<string, string> = { zec: "Zcash", base: "Base", sol: "Solana" };

export function WalletDetails() {
  const account = useAccount();
  const [check, setCheck] = useState<{ ok: boolean; detail: string } | null>(null);
  const [checking, setChecking] = useState(false);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status === "error") return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account.</p>;
  const { user, agent } = account.me;
  if (!user) return <PasskeyGate title="Sign in to see your bot wallet" />;
  if (!agent) {
    return (
      <div className="panel p-5 text-sm">
        No bot wallet yet.{" "}
        <Link href="/bots/setup" className="text-fox-light">
          Create one
        </Link>
      </div>
    );
  }

  async function runCheck() {
    setChecking(true);
    try {
      setCheck(await checkBotPermission());
    } catch (e) {
      setCheck({ ok: false, detail: e instanceof Error ? e.message : "Check failed" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="panel-hero p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-line text-fox-light">
            <Wallet size={20} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              agent.status === "ACTIVE" ? "bg-up/15 text-up" : "bg-gold/15 text-gold"
            }`}
          >
            {agent.status === "ACTIVE" ? "Active" : agent.status}
          </span>
        </div>
        <p className="eyebrow mt-4">Funding</p>
        <p className="mt-2 text-xl font-light tracking-[-0.02em]">Not funded yet</p>
        <p className="mt-2 text-xs text-muted">Depositing ZEC or USDC and live balances arrive in the next update.</p>
      </section>

      <section className="panel p-5">
        <p className="eyebrow">Limits you signed</p>
        <dl className="tabular mt-3 text-sm">
          <Row label="Daily budget" value={`$${agent.dailyBudgetUsd} per day`} />
          <Row label="Trades per hour" value={`Up to ${agent.maxActionsPerHour ?? "∞"}`} />
          <Row label="Bots may" value="Swap ZEC ⇄ USDC, limit orders, withdraw" />
        </dl>
        <p className="eyebrow mt-5">Money can only go to</p>
        <ul className="mt-2 space-y-2">
          {agent.withdrawTo.map((d) => (
            <li key={d.chain + d.address} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink px-3 py-2.5">
              <span className="min-w-0">
                <span className="eyebrow block text-[9px]">{CHAIN_LABEL[d.chain] ?? d.chain}</span>
                <span className="block truncate font-mono text-sm">{shortAddress(d.address, 10)}</span>
              </span>
              <CopyButton value={d.address} />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <p className="eyebrow">Zorro&apos;s bot permission</p>
        {agent.grant ? (
          <>
            <p className="mt-3 flex items-center gap-2 text-sm">
              <ShieldCheck size={16} className={agent.grant.revoked ? "text-down" : "text-up"} aria-hidden="true" />
              {agent.grant.revoked ? "Revoked" : `"${agent.grant.label}" · valid until ${new Date(agent.grant.expiresAt).toLocaleDateString()}`}
            </p>
            <button type="button" onClick={runCheck} disabled={checking} className="btn-secondary mt-4 min-h-10 w-full text-[13px]">
              {checking ? "Checking with NEAR Intents…" : "Test permission"}
            </button>
            {check && (
              <p role="status" className={`mt-2 text-xs ${check.ok ? "text-up" : "text-down"}`}>
                {check.detail}
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No permission stored.</p>
        )}
      </section>

      <section className="panel p-5">
        <p className="eyebrow">On NEAR Intents</p>
        <dl className="mt-3 text-sm">
          <Row label="Agent ID" value={shortAddress(agent.id, 8)} copy={agent.id} />
          {agent.nearAccountId && <Row label="Wallet account" value={shortAddress(agent.nearAccountId, 8)} copy={agent.nearAccountId} />}
          <Row label="Created" value={new Date(agent.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} />
        </dl>
      </section>

      <button type="button" onClick={() => void signOut()} className="btn-secondary w-full">
        Sign out of Zorro
      </button>
    </div>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-right text-snow/90">
        <span className={copy ? "font-mono text-xs" : ""}>{value}</span>
        {copy && <CopyButton value={copy} />}
      </dd>
    </div>
  );
}
