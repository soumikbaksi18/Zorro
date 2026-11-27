import type { Metadata } from "next";
import { Suspense } from "react";
import { Receipt } from "./Receipt";

export const metadata: Metadata = { title: "Receipt · Zorro" };

export default function ReceiptPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-[26px] bg-tint-1/20" />}>
      <ReceiptLoader params={params} />
    </Suspense>
  );
}

async function ReceiptLoader({ params }: { params: PageProps<"/pay/[id]">["params"] }) {
  const { id } = await params;
  return <Receipt id={id} />;
}
