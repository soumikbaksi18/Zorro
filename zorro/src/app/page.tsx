import Image from "next/image";
import Link from "next/link";
import { Market } from "@/components/Market";
import { InstallBanner } from "@/components/InstallBanner";
import { ORDER_TYPES } from "@/lib/order-types";

export default function Home() {
  return (
    <main className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Image src="/brand/zorro-mark.png" alt="" width={44} height={44} className="rounded-xl" priority />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Zorro</h1>
          <p className="text-xs text-muted">Set it, forget it. Your ZEC stays yours.</p>
        </div>
      </header>

      <InstallBanner />

      <Market />

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="mb-3 text-sm font-medium text-muted">
          What do you want to do?
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {ORDER_TYPES.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href ?? `/trade#${t.key}`}
                className={`flex h-full flex-col rounded-2xl border bg-surface p-4 transition-colors hover:border-fox/60 ${
                  t.href ? "border-fox/40" : "border-line"
                }`}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  {t.title}
                  {!t.href && <span className="text-[10px] font-normal text-muted">Soon</span>}
                </span>
                <span className="mt-1 text-xs leading-relaxed text-muted">{t.example}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="px-2 text-center text-xs leading-relaxed text-muted">
        Zorro never holds your keys or funds. Every trade is a payment you approve in your own wallet, routed through
        NEAR Intents.
      </p>
    </main>
  );
}
