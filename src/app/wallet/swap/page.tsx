import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { SwapFlow } from "./SwapFlow";

export const metadata: Metadata = { title: "Swap · Zorro" };

export default function WalletSwapPage() {
  return (
    <>
      <PageHeader title="Swap" lead="Convert inside your Zorro wallet: ZEC to USDC, SOL, ETH and more, or back to ZEC." back={{ href: "/", label: "Home" }} />
      <Suspense fallback={<div className="panel h-72 animate-pulse" />}>
        <SwapFlow />
      </Suspense>
    </>
  );
}
