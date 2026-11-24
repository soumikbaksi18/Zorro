import type { Metadata } from "next";
import { SettingsPanel } from "./SettingsPanel";

export const metadata: Metadata = { title: "Settings · Zorro" };

export default function SettingsPage() {
  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <SettingsPanel />

      <section className="rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed">
        <h2 className="font-medium">How Zorro keeps your funds safe</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
          <li>Zorro never asks for your seed phrase and never holds your ZEC or USDC.</li>
          <li>Every trade is a payment you confirm in your own wallet (Zodl, MetaMask, Phantom).</li>
          <li>Swaps run through NEAR Intents. Swaps are publicly visible on NEAR, so use a fresh shielded address for each one.</li>
          <li>There are no accounts. Your orders are tied to an anonymous ID stored only on this phone.</li>
        </ul>
      </section>
    </main>
  );
}
