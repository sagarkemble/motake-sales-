"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabaseBrowserClient } from "~/lib/supabase-browser-client";
import { CART_LOCAL_STORAGE_KEY } from "~/providers/cart-provider";
import { trpc } from "~/trpc/client";

export function AuthSessionSync() {
  const queryClient = useQueryClient();
  const createSessionMutation = trpc.auth.createSession.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseBrowserClient.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) {
        createSessionMutation.mutate({ accessToken: session.access_token });
      } else if (event === "SIGNED_OUT") {
        logoutMutation.mutate();
        queryClient.clear();
        try {
          window.localStorage.removeItem(CART_LOCAL_STORAGE_KEY);
        } catch {}
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
