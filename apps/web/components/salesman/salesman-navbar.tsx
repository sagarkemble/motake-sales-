"use client";

import { LogOutIcon, MenuIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "~/components/ui/sheet";
import { getErrorMessage } from "~/lib/get-error-message";
import { getNameInitials } from "~/lib/get-name-initials";
import { useAuth } from "~/hooks/use-auth";
import { isNavItemActive, salesmanNavItems } from "./nav-items";

export function SalesmanNavbar() {
  const currentPathname = usePathname();
  const router = useRouter();
  const { signedInUser, logoutAsync } = useAuth();

  const avatarInitial = getNameInitials(signedInUser?.name, "S");

  async function handleLogout() {
    try {
      await logoutAsync();
      router.replace("/login");
    } catch (logoutError) {
      toast.error(getErrorMessage(logoutError, "Could not log out. Try again."));
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetHeader>
              <SheetTitle>Motake</SheetTitle>
              <p className="text-xs text-muted-foreground">Salesman</p>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {salesmanNavItems.map((navItem) => {
                const NavIcon = navItem.icon;
                const isActiveTab = isNavItemActive(navItem.href, currentPathname);
                return (
                  <Link
                    key={navItem.href}
                    href={navItem.href}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActiveTab
                        ? "bg-brand/10 text-brand"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <NavIcon className="size-4" />
                    {navItem.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="leading-tight">
          <p className="text-sm font-bold text-foreground">Motake</p>
          <p className="text-xs text-muted-foreground">Salesman</p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Open account menu">
            <Avatar>
              <AvatarImage src={signedInUser?.avatarUrl ?? undefined} alt="Avatar" />
              <AvatarFallback>{avatarInitial}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/salesman/account">
              <UserIcon className="size-4" />
              Account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleLogout}>
            <LogOutIcon className="size-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
