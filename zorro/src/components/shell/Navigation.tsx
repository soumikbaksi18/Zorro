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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/92 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 font-mono text-[9px] tracking-[0.12em] uppercase transition-colors ${
                  active ? "text-fox-light" : "text-muted hover:text-snow"
                }`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${active ? "bg-fox/20" : ""}`}>
                  <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
