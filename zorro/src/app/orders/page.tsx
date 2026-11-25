import type { Metadata } from "next";
import { SwapList } from "./SwapList";

export const metadata: Metadata = { title: "Orders · Zorro" };

export default function OrdersPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <p className="eyebrow">Orders</p>
        <h1 className="page-title mt-3">Your swaps and bot trades</h1>
        <p className="page-lead">Live status from NEAR Intents. Stored only on this phone.</p>
      </header>
      <SwapList />
    </div>
  );
}
