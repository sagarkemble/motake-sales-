import { format as dateFnsFormat, type Locale as DateFnsLocale } from "date-fns";
import { enUS, hi } from "date-fns/locale";

import { resolveAppLocale } from "~/locale/config";

/**
 * Display-date helper. Pass the active app locale so month/day names follow en/mr.
 * Machine keys like `yyyy-MM-dd` stay locale-neutral (no localized digits required).
 *
 * Note: date-fns has no `mr` pack; Marathi uses `hi` (Devanagari) as the closest
 * bundled locale for month/weekday tokens. Prefer Intl for pure mr-IN when needed.
 */
const dateFnsLocales: Record<"en" | "mr", DateFnsLocale> = {
  en: enUS,
  // Closest Devanagari locale shipped with date-fns
  mr: hi,
};

export function getDateFnsLocale(appLocale?: string | null): DateFnsLocale {
  return dateFnsLocales[resolveAppLocale(appLocale)];
}

export function formatAppDate(
  date: Date | number | string,
  pattern: string,
  appLocale?: string | null,
): string {
  const value = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";

  // API / storage keys — keep Gregorian ASCII digits
  if (pattern === "yyyy-MM-dd") {
    return dateFnsFormat(value, pattern);
  }

  return dateFnsFormat(value, pattern, { locale: getDateFnsLocale(appLocale) });
}
