import { CircleUserRound, House, Newspaper, ReceiptText, Send, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/pay", label: "Pay", icon: Send },
  { href: "/tracker", label: "Tracker", icon: ReceiptText },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/account", label: "Account", icon: CircleUserRound },
];

/** Which tab a path belongs to. */
export function isActive(href: string, pathname: string | undefined): boolean {
  if (pathname === undefined) return false;
  if (href === "/") return pathname === "/";
  if (href === "/pay") return ["/pay", "/payees", "/autopay", "/request", "/scan", "/swap", "/orders"].some((p) => pathname.startsWith(p));
  if (href === "/account") return pathname.startsWith("/account") || pathname.startsWith("/wallet");
  return pathname.startsWith(href);
}
