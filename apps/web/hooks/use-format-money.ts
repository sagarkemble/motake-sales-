"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

import { formatInr, formatInrCompact } from "~/lib/format-money";

/** Locale-aware money formatters for client components. */
export function useFormatMoney() {
  const locale = useLocale();

  return useMemo(
    () => ({
      formatInr: (amount: number) => formatInr(amount, locale),
      formatInrCompact: (amount: number) => formatInrCompact(amount, locale),
    }),
    [locale],
  );
}
