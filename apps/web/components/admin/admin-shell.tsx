"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "~/components/ui/spinner";
import { useAuth } from "~/hooks/use-auth";
import { AdminBottomTabs } from "./admin-bottom-tabs";
import { AdminNavbar } from "./admin-navbar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { signedInUser, isSignedInUserLoading, isSignedInUserError } = useAuth();
  const isAdmin = signedInUser?.role === "admin";

  useEffect(() => {
    if (isSignedInUserLoading) return;
    if (!signedInUser || isSignedInUserError) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) router.replace("/salesman");
  }, [signedInUser, isSignedInUserLoading, isSignedInUserError, isAdmin, router]);

  if (isSignedInUserLoading || !isAdmin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AdminNavbar />
      <main className="flex-1 pb-20 md:pb-6">{children}</main>
      <AdminBottomTabs />
    </div>
  );
}
