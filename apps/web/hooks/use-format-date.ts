"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

import { formatAppDate } from "~/lib/format-date";

/** Locale-aware date formatter for client components. */
export function useFormatDate() {
  const locale = useLocale();

  return useCallback(
    (date: Date | number | string, pattern: string) => formatAppDate(date, pattern, locale),
    [locale],
  );
}
