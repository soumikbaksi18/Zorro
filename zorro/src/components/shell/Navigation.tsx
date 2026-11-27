"use client";

// Bottom tab bar. It reads the URL to highlight the current tab; TabBarView
// without a pathname is the <Suspense> fallback while the URL streams in.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, isActive } from "./nav";

export function TabBar() {
  return <TabBarView pathname={usePathname()} />;
}

export function TabBarView({ pathname }: { pathname?: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto flex max-w-md px-2">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 pt-3 pb-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-zec" : "text-muted hover:text-snow"
                }`}
              >
                <Icon size={21} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
