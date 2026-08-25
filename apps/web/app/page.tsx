"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PageSplashSkeleton } from "~/components/shared/page-splash-skeleton";
import { useAuth } from "~/hooks/use-auth";

export default function Home() {
  const router = useRouter();
  const { signedInUser, isSignedInUserLoading, isSignedInUserError } = useAuth();

  useEffect(() => {
    if (isSignedInUserLoading) return;
    if (!signedInUser || isSignedInUserError) {
      router.replace("/login");
      return;
    }
    router.replace(signedInUser.role === "admin" ? "/admin" : "/salesman");
  }, [signedInUser, isSignedInUserLoading, isSignedInUserError, router]);

  return <PageSplashSkeleton />;
}
