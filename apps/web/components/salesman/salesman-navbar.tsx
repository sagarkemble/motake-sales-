"use client";

import { LogOutIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { getErrorMessage } from "~/lib/get-error-message";
import { useAuth } from "~/hooks/use-auth";
import { getPageTitleForPathname } from "./nav-items";

export function SalesmanNavbar() {
  const currentPathname = usePathname();
  const router = useRouter();
  const { logoutAsync } = useAuth();

  const pageTitle = getPageTitleForPathname(currentPathname);

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
      <p className="text-base font-semibold text-foreground">{pageTitle}</p>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Open account menu">
            <Avatar>
              <AvatarFallback>S</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={handleLogout}>
            <LogOutIcon className="size-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
