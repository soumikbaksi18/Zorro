import type { Metadata } from "next";
import Link from "next/link";
import { SwapForm } from "./SwapForm";

export const metadata: Metadata = { title: "Swap · Zorro" };

export default function SwapPage() {
  return (
    <main className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Link href="/trade" aria-label="Back to Trade" className="-ml-1 rounded-lg p-1 text-muted hover:text-snow">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Swap now</h1>
          <p className="text-sm text-muted">ZEC ⇄ USDC at today&apos;s price, via NEAR Intents</p>
        </div>
      </header>
      <SwapForm />
    </main>
  );
}
