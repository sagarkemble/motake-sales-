"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import React, { useState } from "react";
import { Toaster } from "~/components/ui/sonner";
import { AuthSessionSync } from "~/components/shared/auth-session-sync";
import { signOutIfAccountDeleted } from "~/lib/account-deleted";

import { trpc } from "~/trpc/client";
import { createTRPCHttpBatchClientClient } from "~/trpc/create-client";

// A removed account is signed out on the first refused request, read or write.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: signOutIfAccountDeleted }),
  mutationCache: new MutationCache({ onError: signOutIfAccountDeleted }),
  defaultOptions: {
    queries: {
      refetchOnMount: true,
      staleTime: Infinity,
    },
  },
});

interface GlobalProvidersProps {
  children: React.ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
}

export const GlobalProviders: React.FC<GlobalProvidersProps> = ({ children, locale, messages }) => {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [createTRPCHttpBatchClientClient()],
    }),
  );
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <NextThemesProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
          <trpc.Provider queryClient={queryClient} client={trpcClient}>
            <AuthSessionSync />
            {children}
            <Toaster position="top-right" />
          </trpc.Provider>
        </NextThemesProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
};
