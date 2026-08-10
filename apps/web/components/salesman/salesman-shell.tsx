"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "~/components/ui/spinner";
import { useAuth } from "~/hooks/use-auth";
import { CartProvider } from "~/providers/cart-provider";
import { SalesmanBottomTabs } from "./salesman-bottom-tabs";
import { SalesmanNavbar } from "./salesman-navbar";

export function SalesmanShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { signedInUser, isSignedInUserLoading, isSignedInUserError } = useAuth();
  const isSalesman = signedInUser?.role === "salesman";

  useEffect(() => {
    if (isSignedInUserLoading) return;
    if (!signedInUser || isSignedInUserError) {
      router.replace("/login");
      return;
    }
    if (!isSalesman) router.replace("/admin");
  }, [signedInUser, isSignedInUserLoading, isSignedInUserError, isSalesman, router]);

  if (isSignedInUserLoading || !isSalesman) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </main>
    );
  }

  return (
    <CartProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <SalesmanNavbar />
        <main className="flex-1 pb-20">{children}</main>
        <SalesmanBottomTabs />
      </div>
    </CartProvider>
  );
}
