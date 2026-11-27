"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowLeftRight, ChevronRight, HandCoins, Plus, Repeat, ScanLine, Search, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { shortAddress } from "@/lib/addresses";
import { findCoin } from "@/lib/coins";
import type { PayeeView } from "@/lib/payees";
import { PayeeAvatar } from "@/components/PayeeAvatar";
import { coinName } from "@/components/money";
import { PageHeader } from "@/components/shell/PageHeader";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";
import { PayForm } from "./PayForm";

const MORE: { href: string; label: string; note: string; icon: LucideIcon }[] = [
  { href: "/scan", label: "Scan to pay", note: "Pay a checkout QR or address", icon: ScanLine },
  { href: "/autopay", label: "Autopay", note: "Rent, family, salaries on a schedule", icon: Repeat },
  { href: "/request", label: "Request money", note: "A link anyone can pay in any coin", icon: HandCoins },
  { href: "/swap", label: "Pay from another wallet", note: "Pay straight from Zashi or Vizor", icon: ArrowLeftRight },
];

export function PayHub() {
  const account = useAccount();
  const params = useSearchParams();
  const router = useRouter();
  const to = params.get("to");
  const [payees, setPayees] = useState<PayeeView[] | null>(null);
  const [query, setQuery] = useState("");
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  useEffect(() => {
    if (!hasWallet) return;
    api<PayeeView[]>("/api/payees")
      .then(setPayees)
      .catch(() => setPayees([]));
  }, [hasWallet]);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) {
    return (
      <>
        <PageHeader title="Pay" />
        <PasskeyGate title="Sign in to pay" />
      </>
    );
  }
  if (!hasWallet) {
    return (
      <>
        <PageHeader title="Pay" />
        <div className="panel p-5 text-sm">
          Create your wallet first.{" "}
          <Link href="/wallet/setup" className="text-brand">
            Create wallet
          </Link>
        </div>
      </>
    );
  }

  const selected = to ? payees?.find((p) => p.id === to) : undefined;
  if (to && payees && selected) {
    return (
      <>
        <header className="mb-6">
          <button type="button" onClick={() => router.push("/pay")} aria-label="Back to Pay" className="icon-btn mb-4">
            <ArrowLeft size={19} aria-hidden="true" />
          </button>
          <h1 className="page-title">
            Sending
            <br />
            <span className="pl-10">money</span>
          </h1>
          <div className="mt-5 flex items-center gap-3 rounded-full bg-white/[0.06] p-1.5 pr-4">
            <PayeeAvatar name={selected.name} coinKey={selected.coinKey} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{selected.name}</p>
              <p className="truncate text-xs text-muted">
                Receives {coinName(findCoin(selected.coinKey))} · {selected.kind === "zorro" ? `@${selected.handle}` : shortAddress(selected.address, 6)}
              </p>
            </div>
          </div>
        </header>
        <PayForm payee={selected} initialAmount={params.get("amount") ?? ""} initialCurrency={params.get("currency")} />
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (payees ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.handle ?? "").includes(q));
  return (
    <>
      <PageHeader
        title="Pay"
        lead="Pay anyone in the coin they want. Zorro converts your ZEC at the moment you pay."
        action={
          <Link href="/scan" aria-label="Scan to pay" className="grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-ink">
            <ScanLine size={20} aria-hidden="true" />
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <label className="relative block">
          <span className="sr-only">Search payees</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-dim" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payees" className="field pl-10 text-sm" />
        </label>

        <section aria-labelledby="payees-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="payees-heading" className="section-title">
              Payees
            </h2>
            <Link href="/payees" className="text-sm text-brand hover:text-brand-light">
              Manage
            </Link>
          </div>
          {payees === null ? (
            <div className="panel h-28 animate-pulse" />
          ) : (
            <ul className="grid grid-cols-4 gap-y-4">
              <li>
                <Link href="/payees" className="flex flex-col items-center gap-2 text-center text-xs text-snow/80">
                  <span className="grid h-[52px] w-[52px] place-items-center rounded-full border border-dashed border-brand/60 text-brand">
                    <Plus size={20} aria-hidden="true" />
                  </span>
                  New
                </Link>
              </li>
              {visible.map((p) => (
                <li key={p.id}>
                  <Link
                    href={p.status === "approved" ? `/pay?to=${p.id}` : "/payees"}
                    className={`flex flex-col items-center gap-2 text-center text-xs ${p.status === "approved" ? "text-snow/90" : "text-muted"}`}
                  >
                    <PayeeAvatar name={p.name} coinKey={p.coinKey} size={52} />
                    <span className="w-full truncate px-1">{p.name}</span>
                    {p.status !== "approved" && <span className="-mt-1.5 text-[10px] text-gold">Needs approval</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {to && payees && !selected && <p className="mt-3 text-sm text-down">That payee isn&apos;t available.</p>}
        </section>

        <ul className="panel divide-y divide-line">
          {MORE.map(({ href, label, note, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 p-4 hover:bg-white/3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand/12 text-brand">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-medium">{label}</strong>
                  <span className="block text-xs text-muted">{note}</span>
                </span>
                <ChevronRight size={16} className="text-dim" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
