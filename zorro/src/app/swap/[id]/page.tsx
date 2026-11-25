import type { Metadata } from "next";
import { Suspense } from "react";
import { SwapTracker } from "./SwapTracker";

export const metadata: Metadata = { title: "Swap status · Zorro" };

export default function SwapStatusPage({ params }: PageProps<"/swap/[id]">) {
  return (
    <main className="flex flex-col gap-5">
      <Suspense fallback={<p className="text-muted">Loading swap…</p>}>
        <Tracker params={params} />
      </Suspense>
    </main>
  );
}

async function Tracker({ params }: { params: PageProps<"/swap/[id]">["params"] }) {
  const { id } = await params;
  return <SwapTracker id={decodeURIComponent(id)} />;
}
