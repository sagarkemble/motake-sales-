import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function isNavItemActive(itemHref: string, currentPathname: string, homeHref: string) {
  if (itemHref === homeHref) return currentPathname === homeHref;
  return currentPathname.startsWith(itemHref);
}

export function getPageTitleForPathname(
  navItems: NavItem[],
  currentPathname: string,
  homeHref: string,
  fallbackTitle: string,
) {
  const matchedItem = navItems.find((item) =>
    isNavItemActive(item.href, currentPathname, homeHref),
  );
  return matchedItem?.label ?? fallbackTitle;
}
