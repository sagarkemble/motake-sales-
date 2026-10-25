"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

import { formatPaise, formatPaiseCompact } from "~/lib/format-money";

/** Locale-aware money formatters for client components. Amounts are integer paise. */
export function useFormatMoney() {
  const locale = useLocale();

  return useMemo(
    () => ({
      formatPaise: (paise: number) => formatPaise(paise, locale),
      formatPaiseCompact: (paise: number) => formatPaiseCompact(paise, locale),
    }),
    [locale],
  );
}
