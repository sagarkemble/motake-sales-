"use client";

import { ChevronDownIcon, LogOutIcon, MenuIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LanguageSwitcher } from "~/components/shared/language-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";
import { cn } from "~/lib/utils";
import { NavbarRefreshButton } from "~/providers/page-refresh-provider";
import { getPageTitleForPathname, salesmanQuickActions } from "./nav-items";

export function SalesmanNavbar() {
  const tx = useTranslate();
  const currentPathname = usePathname();
  const router = useRouter();
  const { signedInUser, logoutAsync } = useAuth();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [areQuickActionsOpen, setQuickActionsOpen] = useState(true);

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
                {/* Products, Cart, Gate Pass and Orders are in the bottom tabs; the menu leads
                    with what they don't have. */}
                <Collapsible
                  open={areQuickActionsOpen}
                  onOpenChange={setQuickActionsOpen}
                  className="flex flex-col gap-2 px-4 pt-4"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      className="h-14 w-full justify-start gap-3 rounded-2xl bg-brand px-4 text-base font-semibold text-brand-foreground shadow-sm hover:bg-brand-deep"
                    >
                      <SparklesIcon className="size-5" />
                      <span className="flex-1 text-left">{tx("common.nav.quickActions")}</span>
                      <ChevronDownIcon
                        className={cn(
                          "size-5 transition-transform",
                          areQuickActionsOpen && "rotate-180",
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
                    {salesmanQuickActions.map((quickAction) => {
                      const QuickActionIcon = quickAction.icon;
                      return (
                        <Link
                          key={quickAction.href}
                          href={quickAction.href}
                          onClick={closeDrawer}
                          className="flex items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0 hover:bg-brand-faint"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                            <QuickActionIcon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              {tx(quickAction.label)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {tx(quickAction.hint)}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>

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
