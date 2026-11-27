import type { Metadata } from "next";
import { Globe, Link2, Server, Sparkles, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { AccountCard } from "./AccountCard";
import { SettingsPanel } from "./SettingsPanel";
import { SystemStatus } from "./SystemStatus";

export const metadata: Metadata = { title: "Account · Zorro" };

const VISIBILITY = [
  {
    icon: Users,
    title: "People you pay",
    body: "See only what lands at their address (and the reference on their receipt), never your balance or other payments. It arrives from NEAR Intents, not from an address of yours.",
  },
  {
    icon: Globe,
    title: "NEAR Intents",
    body: "Holds your wallet's private balance and runs each payment under the rules you signed. It sees amounts, payees and timing.",
  },
  {
    icon: Server,
    title: "Zorro's server",
    body: "Runs your payments and Autopay. Stores payees, your payment history and an encrypted payment permission. Never your passkey, keys or funds.",
  },
  {
    icon: Link2,
    title: "Blockchains",
    body: "Adding money and payouts to other chains are public on those chains. ZEC enters and leaves through transparent (t1) addresses. Zorro-to-Zorro payments stay off public chains.",
  },
  {
    icon: Sparkles,
    title: "AI service",
    body: "Only sees what you type and your payees' names. Zorro blocks addresses, balances, keys and tokens from being sent to it.",
  },
];

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account" />
      <div className="flex flex-col gap-6">
        <AccountCard />
        <SettingsPanel />
        <SystemStatus />
        <section className="panel p-5" aria-labelledby="trust-heading">
          <h2 id="trust-heading" className="section-title">
            Who can see what
          </h2>
          <div className="mt-3">
            {VISIBILITY.map(({ icon: Icon, title, body }) => (
              <div key={title} className="visibility-row">
                <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            Private from the public, not from everyone: keep long-term savings shielded in your Zcash wallet and top up Zorro with spending money. No analytics.
          </p>
        </section>
      </div>
    </>
  );
}
