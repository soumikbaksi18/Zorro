import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequestsManager } from "./RequestsManager";

export const metadata: Metadata = { title: "Request money · Zorro" };

export default function RequestPage() {
  return (
    <>
      <PageHeader
        title="Request money"
        lead="Share a link. They pay in any coin they hold (USDC, SOL, BTC…) and it arrives in your wallet as ZEC."
        back={{ href: "/pay", label: "Pay" }}
      />
      <RequestsManager />
    </>
  );
}
