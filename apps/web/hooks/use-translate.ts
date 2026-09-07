"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

import { translate, type TranslateValues } from "~/locale/translate";

/**
 * Client helper: `tx("Save changes")` → string in the user's active locale.
 * All UI copy should go through this (or server `translate`) — nowhere else.
 */
export function useTranslate() {
  const locale = useLocale();

  return useCallback(
    (english: string, values?: TranslateValues) => translate(locale, english, values),
    [locale],
  );
}
