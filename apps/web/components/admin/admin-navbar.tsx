"use client";

import { LogOutIcon, MenuIcon, SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { UpdatePhoneNumberDialog } from "~/components/account/update-phone-number-dialog";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { useAuth } from "~/hooks/use-auth";
import { adminNavItems, getPageTitleForPathname, isNavItemActive } from "./nav-items";

export function AdminNavbar() {
  const currentPathname = usePathname();
  const router = useRouter();
  const { signedInUser, logoutAsync } = useAuth();
  const [isUpdatePhoneDialogOpen, setIsUpdatePhoneDialogOpen] = useState(false);

  const pageTitle = getPageTitleForPathname(currentPathname);
  const avatarInitial = signedInUser?.role.charAt(0).toUpperCase() ?? "A";

  async function handleLogout() {
    await logoutAsync();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-6">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetHeader>
              <SheetTitle>Motake Admin</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {adminNavItems.map((navItem) => {
                const NavIcon = navItem.icon;
                return (
                  <Link
                    key={navItem.href}
                    href={navItem.href}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    <NavIcon className="size-4" />
                    {navItem.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <p className="text-sm font-semibold text-foreground md:hidden">{pageTitle}</p>

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
                {navItem.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Open account menu">
            <Avatar>
              <AvatarFallback>{avatarInitial}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsUpdatePhoneDialogOpen(true)}>
            <SmartphoneIcon className="size-4" />
            Update phone number
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleLogout}>
            <LogOutIcon className="size-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UpdatePhoneNumberDialog
        open={isUpdatePhoneDialogOpen}
        onOpenChange={setIsUpdatePhoneDialogOpen}
      />
    </header>
  );
}
