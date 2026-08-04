import { LayoutDashboard, Package, ShoppingCart, Store, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const adminNavItems: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Salesman", href: "/admin/salesman", icon: Users },
  { label: "Orders", href: "/admin/orders", icon: ShoppingCart },
  { label: "Customers", href: "/admin/customers", icon: Store },
];

export function isNavItemActive(itemHref: string, currentPathname: string) {
  if (itemHref === "/admin") return currentPathname === "/admin";
  return currentPathname.startsWith(itemHref);
}

export function getPageTitleForPathname(currentPathname: string) {
  const matchedItem = adminNavItems.find((item) => isNavItemActive(item.href, currentPathname));
  return matchedItem?.label ?? "Motake";
}
