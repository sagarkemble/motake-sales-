"use client";

import { LogOutIcon, MenuIcon, SmartphoneIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { UpdatePhoneNumberDialog } from "~/components/account/update-phone-number-dialog";
import { LanguageSwitcher } from "~/components/shared/language-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";
import {
  adminNavItems,
  adminQuickActions,
  getPageTitleForPathname,
  isNavItemActive,
} from "./nav-items";

export function AdminNavbar() {
  const tx = useTranslate();
  const currentPathname = usePathname();
  const router = useRouter();
  const { signedInUser, logoutAsync } = useAuth();
  const [isUpdatePhoneDialogOpen, setIsUpdatePhoneDialogOpen] = useState(false);

  const pageTitle = getPageTitleForPathname(currentPathname);
  const avatarInitial = getNameInitials(signedInUser?.name, signedInUser?.role.charAt(0) ?? "A");

  async function handleLogout() {
    try {
      await logoutAsync();
      router.replace("/login");
    } catch (logoutError) {
      toast.error(getErrorMessage(logoutError, tx("Could not log out. Try again.")));
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-6">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={tx("Open menu")} className="md:hidden">
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Motake Admin</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {adminNavItems.map((navItem) => {
                const NavIcon = navItem.icon;
                const isActiveTab = isNavItemActive(navItem.href, currentPathname);
                return (
                  <Link
                    key={navItem.href}
                    href={navItem.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActiveTab ? "bg-brand/10 text-brand" : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <NavIcon className="size-4" />
                    {tx(navItem.label)}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 border-t border-border px-4 pt-4">
              <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tx("Quick actions")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {adminQuickActions.map((quickAction) => {
                  const QuickActionIcon = quickAction.icon;
                  return (
                    <Link
                      key={quickAction.href}
                      href={quickAction.href}
                      className="flex flex-col items-start gap-2 rounded-xl border bg-card p-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-brand/40 hover:bg-brand/5"
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
          </SheetContent>
        </Sheet>

        <p className="font-display text-base font-semibold text-foreground md:hidden">
          {pageTitle === "Motake" ? pageTitle : tx(pageTitle)}
        </p>

        <nav className="hidden items-center gap-1 md:flex">
          {adminNavItems.map((navItem) => {
            const isActiveTab = isNavItemActive(navItem.href, currentPathname);
            return (
              <Link
                key={navItem.href}
                href={navItem.href}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  isActiveTab
                    ? "bg-brand/10 text-brand"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {navItem.label === "Motake" ? navItem.label : tx(navItem.label)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-1.5">
        <LanguageSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label={tx("Open account menu")}>
              <Avatar className="ring-2 ring-transparent transition-shadow hover:ring-brand/30">
                <AvatarImage src={signedInUser?.avatarUrl ?? undefined} alt="Avatar" />
                <AvatarFallback>{avatarInitial}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/admin/account">
                <UserIcon className="size-4" />
                {tx("Profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsUpdatePhoneDialogOpen(true)}>
              <SmartphoneIcon className="size-4" />
              {tx("Update phone number")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOutIcon className="size-4" />
              {tx("Logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <UpdatePhoneNumberDialog
        open={isUpdatePhoneDialogOpen}
        onOpenChange={setIsUpdatePhoneDialogOpen}
      />
    </header>
  );
}
