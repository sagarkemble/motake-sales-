"use client";

import { useEffect } from "react";

import { supabaseBrowserClient } from "~/lib/supabase-browser-client";
import { trpc } from "~/trpc/client";

export function AuthSessionSync() {
  const createSessionMutation = trpc.auth.createSession.useMutation();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseBrowserClient.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) {
        createSessionMutation.mutate({ accessToken: session.access_token });
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
