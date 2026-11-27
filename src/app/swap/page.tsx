import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { SwapForm } from "./SwapForm";

export const metadata: Metadata = { title: "Pay from another wallet · Zorro" };

export default function SwapPage() {
  return (
    <>
      <PageHeader
        title="Pay from another wallet"
        lead="Pay someone in USDC straight from your own Zcash wallet (or ZEC from your USDC wallet). Your wallet app signs; Zorro holds nothing."
        back={{ href: "/pay", label: "Pay" }}
      />
      <SwapForm />
    </>
  );
}
