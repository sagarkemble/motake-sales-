/**
 * Motake locale config.
 *
 * Convention:
 * - UI copy goes through `tx` / `translate` only (see `locale/translate.ts`).
 * - Catalog keys are the English UI sentences; `messages/mr.json` holds Marathi.
 * - Do NOT translate: brand "Motake" / "Motake Admin", shop names, product names,
 *   variety names, or free-text notes (user-generated content).
 * - To add a string: keep the English key identical to the UI string, add the
 *   Marathi value under the same key in `messages/mr.json`.
 */
export const locales = ["en", "mr"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

/** Cookie used by middleware + language switcher (SSR-friendly). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return value === "en" || value === "mr";
}

export function resolveAppLocale(value: string | undefined | null): AppLocale {
  return isAppLocale(value) ? value : defaultLocale;
}
