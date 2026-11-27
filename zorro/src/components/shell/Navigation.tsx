"use client";

// Floating bottom bar. It reads the URL to highlight the current tab; TabBarView
// without a pathname is the <Suspense> fallback while the URL streams in.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, isActive } from "./nav";

export function TabBar() {
  return <TabBarView pathname={usePathname()} />;
}

export function TabBarView({ pathname }: { pathname?: string }) {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),14px)]">
      <ul className="pointer-events-auto mx-auto flex h-[68px] max-w-[400px] items-center justify-between rounded-full border border-white/8 bg-[#111913]/92 px-2.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          if (item.primary) {
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className="grid h-[52px] w-[52px] place-items-center rounded-full bg-brand text-brand-ink shadow-[0_0_0_5px_rgba(184,243,107,0.14)] transition-transform hover:scale-105"
                >
                  <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-label={item.label}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`grid h-[50px] w-[50px] place-items-center rounded-full transition-colors ${
                  active ? "bg-snow text-ink" : "text-snow/70 hover:bg-white/8 hover:text-snow"
                }`}
              >
                <Icon size={21} strokeWidth={active ? 2 : 1.7} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
