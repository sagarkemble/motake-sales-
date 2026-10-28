"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";

export default function AuthCallbackPage() {
  const tx = useTranslate();
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
        <p className="text-sm font-medium text-foreground">{tx("auth.magicLink.linkInvalid")}</p>
        <Link href="/login" className="text-sm text-brand hover:underline">
          {tx("auth.magicLink.backToSignIn")}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <Skeleton className="size-10 rounded-full" />
      <p className="text-sm text-muted-foreground">{tx("auth.magicLink.signingIn")}</p>
    </main>
  );
}
