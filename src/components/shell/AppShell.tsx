import { Suspense } from "react";
import { TabBar } from "./Navigation";

/**
 * Phone layout on every screen size: one centred column with soft yellow light at the
 * top and a bottom tab bar. Each page draws its own header (see PageHeader).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-snow focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:text-ink"
      >
        Skip to content
      </a>
      <div className="ambient" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="screen-glow" aria-hidden="true" />

      <main
        id="main-content"
        className="relative z-10 flex-1 px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[calc(7rem+env(safe-area-inset-bottom))]"
      >
        {children}
      </main>

      {/* No placeholder: the bar is fixed (no layout shift), and some pages hide it entirely. */}
      <Suspense fallback={null}>
        <TabBar />
      </Suspense>
    </div>
  );
}
