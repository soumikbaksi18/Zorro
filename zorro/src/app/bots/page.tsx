import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, Fingerprint, SlidersHorizontal, Bot } from "lucide-react";
import { BOT_TYPES } from "@/lib/order-types";

export const metadata: Metadata = { title: "Bots · Zorro" };

const STEPS = [
  {
    icon: Fingerprint,
    title: "Create your bot wallet",
    body: "One Face ID or fingerprint. No seed phrase. The wallet is yours on NEAR Intents.",
  },
  {
    icon: SlidersHorizontal,
    title: "Sign your limits",
    body: "e.g. trade up to $50/day, and only ever send money to your own addresses.",
  },
  {
    icon: Bot,
    title: "Let the bot run",
    body: "It trades 24/7 within those limits. Pause, change or withdraw anytime.",
  },
];

export default function BotsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Bots</p>
        <h1 className="page-title mt-3">Private, automatic ZEC trading</h1>
        <p className="page-lead">
          Bots trade from your own NEAR Intents wallet. Zorro can only act within the limits you sign, and can
          never send funds anywhere except your addresses.
        </p>
      </header>

      <section aria-labelledby="how-heading" className="panel p-5">
        <h2 id="how-heading" className="eyebrow">
          How it works
        </h2>
        <ol className="mt-5 grid gap-5">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-fox-light">
                <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  <span className="mr-1.5 font-mono text-xs text-dim">0{i + 1}</span>
                  {title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="bots-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="bots-heading" className="eyebrow">
            Strategies
          </h2>
          <span className="font-mono text-[10px] tracking-[0.12em] text-gold uppercase">In development</span>
        </div>
        <ul className="grid gap-3">
          {BOT_TYPES.map(({ key, title, example, how, icon: Icon }) => (
            <li key={key} id={key} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <Icon size={20} strokeWidth={1.6} className="text-fox-light" aria-hidden="true" />
                <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] text-dim uppercase">
                  Soon
                </span>
              </div>
              <h3 className="mt-4 text-base font-medium">{title}</h3>
              <p className="mt-1 text-sm text-snow/80">{example}</p>
              <p className="mt-3 text-xs leading-relaxed text-muted">{how}</p>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/swap" className="panel flex items-center gap-4 p-5 transition-colors hover:border-fox/60 hover:bg-fox/5">
        <ArrowLeftRight size={20} strokeWidth={1.6} className="shrink-0 text-fox-light" aria-hidden="true" />
        <span className="min-w-0">
          <strong className="block text-sm font-medium">Need a trade right now?</strong>
          <span className="text-xs text-muted">Swap ZEC ⇄ USDC manually from your own wallet. Available today.</span>
        </span>
        <ArrowUpRight size={16} className="ml-auto shrink-0 text-dim" aria-hidden="true" />
      </Link>
    </div>
  );
}
