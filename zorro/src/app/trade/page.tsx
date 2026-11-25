import type { Metadata } from "next";
import Link from "next/link";
import { ORDER_TYPES, type OrderType } from "@/lib/order-types";

export const metadata: Metadata = { title: "Trade · Zorro" };

export default function TradePage() {
  return (
    <main className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Trade</h1>
        <p className="mt-1 text-sm text-muted">Pick an order type. Each one runs through NEAR Intents.</p>
      </header>

      <ul className="flex flex-col gap-3">
        {ORDER_TYPES.map((t) => (
          <li key={t.key} id={t.key} className="scroll-mt-4">
            {t.href ? (
              <Link href={t.href} className="block rounded-2xl border border-fox/40 bg-surface p-4 transition-colors hover:border-fox">
                <Card t={t} />
              </Link>
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-4 opacity-80">
                <Card t={t} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

function Card({ t }: { t: OrderType }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">{t.title}</h2>
        {t.href ? (
          <span className="rounded-full bg-fox px-2.5 py-1 text-[11px] font-medium text-snow">Open →</span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">Coming soon</span>
        )}
      </div>
      <p className="mt-1 text-sm text-snow/80">{t.example}</p>
      <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 font-medium ${
            t.execution === "auto" ? "bg-leaf/15 text-leaf" : "bg-gold/15 text-gold"
          }`}
        >
          {t.execution === "auto" ? "Automatic" : "One tap"}
        </span>
        <span>{t.how}</span>
      </p>
    </>
  );
}
