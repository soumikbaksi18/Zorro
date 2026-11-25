import Link from "next/link";
import { ArrowLeftRight, Bot, ListChecks, Settings } from "lucide-react";

const ACTIONS = [
  { href: "/swap", label: "Swap", icon: ArrowLeftRight },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/orders", label: "Orders", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Four tiles under the price, after Zeno's quick-actions row. */
export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="mt-6 grid grid-cols-4 overflow-hidden rounded-xl border border-line">
      {ACTIONS.map(({ href, label, icon: Icon }, i) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-center gap-2 bg-ink/60 px-2 py-3.5 text-center transition-colors hover:bg-fox/10 ${
            i > 0 ? "border-l border-line" : ""
          }`}
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-line text-fox-light">
            <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
