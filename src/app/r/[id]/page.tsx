import type { Metadata } from "next";
import { Suspense } from "react";
import { PayRequest } from "./PayRequest";

export const metadata: Metadata = { title: "Payment request · Zorro", robots: { index: false } };

export default function PublicRequestPage({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<div className="panel h-72 animate-pulse" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/r/[id]">["params"] }) {
  const { id } = await params;
  return <PayRequest id={id} />;
}
