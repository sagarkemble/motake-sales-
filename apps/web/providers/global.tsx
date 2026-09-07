"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import React, { useState } from "react";
import { Toaster } from "~/components/ui/sonner";
import { AuthSessionSync } from "~/components/shared/auth-session-sync";

import { trpc } from "~/trpc/client";
import { createTRPCHttpBatchClientClient } from "~/trpc/create-client";

const queryClient = new QueryClient({
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

export const GlobalProviders: React.FC<GlobalProvidersProps> = ({
  children,
  locale,
  messages,
}) => {
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
