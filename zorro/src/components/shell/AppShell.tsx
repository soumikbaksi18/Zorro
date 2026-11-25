import Link from "next/link";
import { Suspense } from "react";
import { Settings } from "lucide-react";
import { Brand } from "./Brand";
import { TabBar, TabBarView } from "./Navigation";

/**
 * Phone-first layout on every screen size: header, one centred column, bottom tab bar.
 * Styling follows Zeno Wallet (hairline panels, monospace labels) in Zorro's colours.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <a
        href="#main-content"
        className="fixed -top-20 left-4 z-50 rounded-lg bg-snow px-3 py-2 text-sm text-ink focus:top-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-ink/85 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3.5 backdrop-blur">
        <Brand size={32} />
        <div className="flex items-center gap-2">
          <span className="status-pill" title="Zorro runs on Zcash mainnet through NEAR Intents">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
            Mainnet
          </span>
          <Link
            href="/settings"
            aria-label="Settings"
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-snow"
          >
            <Settings size={18} strokeWidth={1.7} />
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1 px-4 pt-5 pb-8">
        {children}
      </main>

      <footer className="flex flex-col gap-1 border-t border-line px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] font-mono text-[10px] tracking-[0.08em] text-dim uppercase">
        <span>Zorro · built for Zcash India</span>
        <span>Zorro never holds your keys or funds</span>
      </footer>

      <Suspense fallback={<TabBarView />}>
        <TabBar />
      </Suspense>
    </div>
  );
}
