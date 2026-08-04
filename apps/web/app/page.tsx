"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "~/components/ui/spinner";
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <Spinner className="size-6 text-muted-foreground" />
    </main>
  );
}
