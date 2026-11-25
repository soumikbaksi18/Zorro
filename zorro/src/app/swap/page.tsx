import type { Metadata } from "next";
import { SwapForm } from "./SwapForm";

export const metadata: Metadata = { title: "Swap · Zorro" };

export default function SwapPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Swap</p>
        <h1 className="page-title mt-3">ZEC ⇄ USDC at today&apos;s price</h1>
        <p className="page-lead">
          A one-off swap through NEAR Intents, paid from your own wallet. For automatic trading, see Bots.
        </p>
      </header>
      <SwapForm />
    </div>
  );
}
