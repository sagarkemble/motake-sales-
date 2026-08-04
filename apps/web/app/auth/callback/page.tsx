"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuth } from "~/hooks/use-auth";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { completeMagicLinkSignIn, magicLinkError } = useAuth({ enabled: false });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    completeMagicLinkSignIn()
      .then(() => router.replace("/"))
      .catch(() => {});
  }, [completeMagicLinkSignIn, router]);

  if (magicLinkError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm font-medium text-foreground">The sign-in link is wrong or expired.</p>
        <Link href="/login" className="text-sm text-brand hover:underline">
          Back to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <Loader2Icon className="size-6 animate-spin text-brand" />
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </main>
  );
}
