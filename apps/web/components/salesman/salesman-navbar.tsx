"use client";

import { LogOutIcon, MenuIcon, UserIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "~/components/shared/language-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";
import { NavbarRefreshButton } from "~/providers/page-refresh-provider";
import {
  getPageTitleForPathname,
  isNavItemActive,
  salesmanNavItems,
  salesmanQuickActions,
} from "./nav-items";

export function SalesmanNavbar() {
  const tx = useTranslate();
  const currentPathname = usePathname();
  const router = useRouter();
  const { signedInUser, logoutAsync } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const pageTitle = getPageTitleForPathname(currentPathname);
  const avatarInitial = getNameInitials(signedInUser?.name, "S");

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  async function handleLogout() {
    closeDrawer();
    try {
      await logoutAsync();
      router.replace("/login");
    } catch (logoutError) {
      toast.error(getErrorMessage(tx, logoutError, tx("common.errors.logoutFailed")));
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={tx("common.a11y.openMenu")}>
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader className="border-b border-border pb-4">
              <Link
                href="/salesman/account"
                onClick={closeDrawer}
                className="flex items-center gap-3"
              >
                <Avatar className="size-11">
                  <AvatarImage src={signedInUser?.avatarUrl ?? undefined} alt="Avatar" />
                  <AvatarFallback>{avatarInitial}</AvatarFallback>
                </Avatar>
                <div className="text-left leading-tight">
                  <SheetTitle className="text-sm">
                    {signedInUser?.name ?? tx("salesman.nav.roleLabel")}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">{signedInUser?.email}</p>
                </div>
              </Link>
            </SheetHeader>

            {/* Radix lays the viewport content out as a table; block keeps the content at the sheet width. */}
            <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
              <div className="flex flex-col gap-4">
                <nav className="flex flex-col gap-1 px-4 pt-4">
                  {salesmanNavItems.map((navItem) => {
                    const NavIcon = navItem.icon;
                    const isActiveTab = isNavItemActive(navItem.href, currentPathname);
                    return (
                      <Link
                        key={navItem.href}
                        href={navItem.href}
                        onClick={closeDrawer}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActiveTab ? "bg-brand/10 text-brand" : "text-foreground hover:bg-accent"
                        }`}
                      >
                        <NavIcon className="size-4" />
                        {tx(navItem.label)}
                      </Link>
                    );
                  })}
                  <Link
                    href="/salesman/customers"
                    onClick={closeDrawer}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isNavItemActive("/salesman/customers", currentPathname)
                        ? "bg-brand/10 text-brand"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <UsersIcon className="size-4" />
                    {tx("salesman.nav.customers")}
                  </Link>
                  <Link
                    href="/salesman/account"
                    onClick={closeDrawer}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isNavItemActive("/salesman/account", currentPathname)
                        ? "bg-brand/10 text-brand"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <UserIcon className="size-4" />
                    {tx("common.nav.account")}
                  </Link>
                </nav>

                <div className="mt-4 border-t border-border px-4 pt-4">
                  <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {tx("common.nav.quickActions")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {salesmanQuickActions.map((quickAction) => {
                      const QuickActionIcon = quickAction.icon;
                      return (
                        <Link
                          key={quickAction.href}
                          href={quickAction.href}
                          onClick={closeDrawer}
                          className="flex flex-col items-start gap-2 rounded-xl border bg-card p-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-faint"
                        >
                          <span className="flex size-8 items-center justify-center rounded-full bg-brand/10 text-brand">
                            <QuickActionIcon className="size-4" />
                          </span>
                          {tx(quickAction.label)}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 border-t border-border px-4 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleLogout}
                    className="h-auto w-full justify-start gap-3 rounded-md px-3 py-2 text-sm font-normal text-destructive hover:bg-destructive-soft hover:text-destructive"
                  >
                    <LogOutIcon className="size-4" />
                    {tx("common.actions.logout")}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <div className="leading-tight">
          <p className="font-display text-base font-semibold text-foreground">
            {pageTitle === "Motake" ? pageTitle : tx(pageTitle)}
          </p>
          <p className="text-xs text-muted-foreground">{tx("salesman.nav.roleLabel")}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <NavbarRefreshButton />
        <LanguageSwitcher />
        <Link href="/salesman/account" aria-label={tx("salesman.nav.openAccount")}>
          <Avatar className="ring-2 ring-transparent transition-shadow hover:ring-brand/30">
            <AvatarImage src={signedInUser?.avatarUrl ?? undefined} alt="Avatar" />
            <AvatarFallback>{avatarInitial}</AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
