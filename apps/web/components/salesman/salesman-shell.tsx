"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PageSplashSkeleton } from "~/components/shared/page-splash-skeleton";
import { useAuth } from "~/hooks/use-auth";
import { CartProvider } from "~/providers/cart-provider";
import { PageRefreshProvider } from "~/providers/page-refresh-provider";
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
    return <PageSplashSkeleton />;
  }

  return (
    <CartProvider>
      <PageRefreshProvider>
        <div className="bg-dairy-doodle flex min-h-dvh flex-col bg-background">
          <SalesmanNavbar />
          <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
          <SalesmanBottomTabs />
        </div>
      </PageRefreshProvider>
    </CartProvider>
  );
}
