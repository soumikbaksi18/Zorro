import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { AutopayManager } from "./AutopayManager";

export const metadata: Metadata = { title: "Autopay · Zorro" };

export default function AutopayPage() {
  return (
    <>
      <PageHeader
        title="Autopay"
        lead="Rent, family, freelancers: paid on time in the coin they want, converted from your ZEC on the day."
        back={{ href: "/pay", label: "Pay" }}
      />
      <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
        <AutopayManager />
      </Suspense>
    </>
  );
}
