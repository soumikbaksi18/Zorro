"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Wallet } from "lucide-react";
import { useAccount } from "@/lib/account-client";
import { PasskeyGate } from "./PasskeyGate";

/** Top of the Bots page: the user's bot wallet, or the next step to get one. */
export function WalletCard() {
  const account = useAccount();

  if (account.status === "loading") return <div className="panel h-40 animate-pulse" />;
  if (account.status === "error") {
    return <p className="panel p-5 text-sm text-muted">Couldn&apos;t load your account. Check your connection.</p>;
  }

  const { user, agent } = account.me;
  if (!user) return <PasskeyGate title="Start with a passkey" />;

  if (!agent) {
    return (
      <section className="panel-hero p-5" aria-labelledby="wallet-heading">
        <p className="eyebrow">Step 2 of 2</p>
        <h2 id="wallet-heading" className="mt-3 text-xl font-light tracking-[-0.02em]">
          Create your bot wallet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Choose a daily budget and the addresses money may go to. One passkey signature creates the wallet and
          gives Zorro permission to trade within those limits.
        </p>
        <Link href="/bots/setup" className="btn-primary mt-5 w-full">
          Set your limits
        </Link>
      </section>
    );
  }

  return (
    <Link
      href="/bots/wallet"
      className="panel-hero flex items-center gap-4 p-5 transition-colors hover:border-fox-light"
      aria-label="Open your bot wallet"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-fox-light">
        <Wallet size={20} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block">Bot wallet</span>
        <span className="mt-1 flex items-center gap-2 text-base font-medium">
          {agent.status === "ACTIVE" ? "Active" : "Confirming…"}
          {agent.grant && !agent.grant.revoked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-up/15 px-2 py-0.5 text-[11px] font-medium text-up">
              <ShieldCheck size={12} aria-hidden="true" /> Bots allowed
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          Up to ${agent.dailyBudgetUsd}/day · {agent.withdrawTo.length} withdrawal address
          {agent.withdrawTo.length === 1 ? "" : "es"}
        </span>
      </span>
      <ArrowUpRight size={16} className="shrink-0 text-dim" aria-hidden="true" />
    </Link>
  );
}
