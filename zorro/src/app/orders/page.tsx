import type { Metadata } from "next";
import { SwapList } from "./SwapList";

export const metadata: Metadata = { title: "Orders · Zorro" };

export default function OrdersPage() {
  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted">Your swaps, take-profits, stop-losses and DCA plans.</p>
      </header>
      <SwapList />
    </main>
  );
}
