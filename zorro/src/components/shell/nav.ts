import { ArrowUp, CircleUserRound, House, Newspaper, ReceiptText, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; primary?: boolean };

/** Bottom bar: Pay sits in the middle as the raised lime action. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/tracker", label: "Tracker", icon: ReceiptText },
  { href: "/pay", label: "Pay", icon: ArrowUp, primary: true },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/account", label: "Account", icon: CircleUserRound },
];

/** Which tab a path belongs to. */
export function isActive(href: string, pathname: string | undefined): boolean {
  if (pathname === undefined) return false;
  if (href === "/") return pathname === "/";
  if (href === "/pay") return ["/pay", "/payees", "/autopay", "/request", "/scan", "/swap", "/orders", "/ask"].some((p) => pathname.startsWith(p));
  if (href === "/account") return pathname.startsWith("/account") || pathname.startsWith("/wallet");
  return pathname.startsWith(href);
}
