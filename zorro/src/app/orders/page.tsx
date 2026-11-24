import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Orders · Zorro" };

export default function OrdersPage() {
  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted">Your take-profits, stop-losses, DCA plans and swaps.</p>
      </header>

      <section className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
        <p className="font-medium">No orders yet</p>
        <p className="mt-1 max-w-64 text-sm text-muted">
          When you set a take-profit, stop-loss or DCA plan, it will show up here with its live status.
        </p>
        <Link href="/trade" className="mt-5 rounded-xl bg-fox px-5 py-2.5 text-sm font-medium text-snow">
          Create an order
        </Link>
      </section>
    </main>
  );
}
