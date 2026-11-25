import type { Metadata } from "next";
import Link from "next/link";
import { WalletDetails } from "./WalletDetails";

export const metadata: Metadata = { title: "Bot wallet · Zorro" };

export default function WalletPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/bots" className="eyebrow hover:text-fox-light">
          ← Bots
        </Link>
        <h1 className="page-title mt-3">Your bot wallet</h1>
        <p className="page-lead">Owned by your passkey on NEAR Intents. Zorro can only act within your limits.</p>
      </header>
      <WalletDetails />
    </div>
  );
}
