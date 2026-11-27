import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { PayeesManager } from "./PayeesManager";

export const metadata: Metadata = { title: "Payees · Zorro" };

export default function PayeesPage() {
  return (
    <>
      <PageHeader
        title="Payees"
        lead="People and apps you pay. Each one is approved once with your Face ID, and Zorro can't pay anyone else."
        back={{ href: "/pay", label: "Pay" }}
      />
      <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
        <PayeesManager />
      </Suspense>
    </>
  );
}
