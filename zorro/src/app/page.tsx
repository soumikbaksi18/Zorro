import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, Bot, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { Market } from "@/components/Market";
import { InstallBanner } from "@/components/InstallBanner";
import { OverviewPanel } from "@/components/OverviewPanel";

type Tool = { href: string; label: string; note: string; icon: LucideIcon; soon?: boolean };

const TOOLS: Tool[] = [
  { href: "/swap", label: "Swap", note: "ZEC ⇄ USDC at today's price", icon: ArrowLeftRight },
  { href: "/bots", label: "Bots", note: "Stop-loss, DCA, take-profit, grid", icon: Bot, soon: true },
  { href: "/assistant", label: "AI assistant", note: "Describe a strategy in words", icon: Sparkles, soon: true },
  { href: "/settings", label: "Status & privacy", note: "Connections and what we store", icon: ShieldCheck },
];

export default function Home() {
  return (
    <>
      <h1 className="sr-only">Zorro overview</h1>
      <InstallBanner />
      <div className="grid gap-6">
        <Market />
        <div className="grid min-w-0 gap-6">
          <OverviewPanel />
          <nav aria-label="Tools" className="grid gap-3">
            {TOOLS.map((t) => (
              <ToolLink key={t.label} tool={t} />
            ))}
          </nav>
        </div>
      </div>
      <p className="mt-8 max-w-xl text-xs leading-relaxed text-dim">
        Zorro never holds your keys or funds. Every trade is a payment you approve in your own wallet, or a bot
        acting within limits you sign, routed through NEAR Intents.
      </p>
    </>
  );
}

function ToolLink({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const body = (
    <>
      <Icon size={18} strokeWidth={1.6} className={tool.soon ? "shrink-0 text-dim" : "shrink-0 text-fox-light"} aria-hidden="true" />
      <span className="grid min-w-0 gap-0.5">
        <strong className="text-sm font-medium">{tool.label}</strong>
        <small className="truncate text-xs text-muted">{tool.note}</small>
      </span>
      {tool.soon ? (
        <span className="ml-auto font-mono text-[9px] tracking-[0.14em] text-dim uppercase">Soon</span>
      ) : (
        <ArrowUpRight size={14} className="ml-auto shrink-0 text-dim" aria-hidden="true" />
      )}
    </>
  );
  const cls = "panel flex items-center gap-3 p-4";
  if (tool.soon && tool.href === "/assistant") {
    return (
      <span className={`${cls} cursor-default opacity-70`} aria-disabled="true">
        {body}
      </span>
    );
  }
  return (
    <Link href={tool.href} className={`${cls} transition-colors hover:border-fox/60 hover:bg-fox/5`}>
      {body}
    </Link>
  );
}
