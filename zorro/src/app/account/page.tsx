import type { Metadata } from "next";
import { Bot, Globe, Link2, Server, Sparkles } from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { SystemStatus } from "./SystemStatus";
import { DemoPanel } from "./DemoPanel";

export const metadata: Metadata = { title: "Settings · Zorro" };

const VISIBILITY = [
  {
    icon: Server,
    title: "Zorro's server",
    body: "Forwards swap quotes and will run your bots. Stores bot settings and an encrypted bot permission, never your seed phrase, keys or funds. Swaps stay on this phone.",
  },
  {
    icon: Globe,
    title: "NEAR Intents",
    body: "Executes swaps and holds bot-wallet funds under the limits you sign. Sees amounts, addresses and timing. Refund addresses are recorded publicly on NEAR.",
  },
  {
    icon: Link2,
    title: "Blockchains",
    body: "Swap deposits and USDC transfers are public on their chains. ZEC delivered by NEAR Intents goes to transparent addresses: shield it in your wallet afterwards.",
  },
  {
    icon: Sparkles,
    title: "AI service",
    body: "Only sees the strategy text you type. Zorro blocks addresses, balances, keys and tokens from being sent to it.",
  },
  {
    icon: Bot,
    title: "Bots",
    body: "Run on Zorro's worker and trade only within your signed policy; funds can only leave to addresses you list. Paper bots only ever ask for quotes.",
  },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Settings</p>
        <h1 className="page-title mt-3">Preferences, status &amp; privacy</h1>
      </header>

      <div className="grid gap-6">
        <div className="flex flex-col gap-6">
          <SettingsPanel />
          <SystemStatus />
          <DemoPanel />
        </div>

        <section className="panel p-5" aria-labelledby="trust-heading">
          <p className="eyebrow">Trust model</p>
          <h2 id="trust-heading" className="mt-3 text-xl font-light tracking-[-0.02em]">
            What everyone can see
          </h2>
          <div className="mt-4">
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
          <p className="mt-2 border-t border-line pt-4 text-xs text-leaf">
            No Zorro account and no analytics.
          </p>
        </section>
      </div>
    </div>
  );
}
