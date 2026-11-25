import { ArrowLeftRight, Bot, House, ListChecks, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/swap", label: "Swap", icon: ArrowLeftRight },
  { href: "/bots", label: "Bots", icon: Bot },
  { href: "/orders", label: "Orders", icon: ListChecks },
];

/** Which tab a path belongs to (swap trackers count as Orders). */
export function isActive(href: string, pathname: string | undefined): boolean {
  if (pathname === undefined) return false;
  if (href === "/") return pathname === "/";
  if (href === "/orders") return pathname.startsWith("/orders") || pathname.startsWith("/swap/");
  if (href === "/swap") return pathname === "/swap";
  return pathname.startsWith(href);
}
