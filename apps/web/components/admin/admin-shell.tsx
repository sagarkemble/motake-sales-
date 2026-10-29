"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PageSplashSkeleton } from "~/components/shared/page-splash-skeleton";
import { useAuth } from "~/hooks/use-auth";
import { AdminBottomTabs } from "./admin-bottom-tabs";
import { AdminNavbar } from "./admin-navbar";
import { WhatsAppTokenBanner } from "./whatsapp-token/whatsapp-token-banner";

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
    return <PageSplashSkeleton />;
  }

  return (
    <div className="bg-dairy-doodle flex min-h-dvh flex-col bg-background">
      <AdminNavbar />
      <WhatsAppTokenBanner />
      <main className="flex-1 pb-20 md:pb-6">{children}</main>
      <AdminBottomTabs />
    </div>
  );
}
