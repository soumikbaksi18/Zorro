import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { Scanner } from "./Scanner";

export const metadata: Metadata = { title: "Scan to pay · Zorro" };

export default function ScanPage() {
  return (
    <>
      <PageHeader title="Scan to pay" lead="Point at a checkout QR, or paste an address or payment link." back={{ href: "/pay", label: "Pay" }} />
      <Scanner />
    </>
  );
}
