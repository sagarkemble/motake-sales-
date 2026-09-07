/**
 * Shared English → locale conversion.
 *
 * Feature code must call `translate` (server/util) or `useTranslate` → `tx`
 * (client). Do not add per-screen Marathi maps or scatter next-intl namespace keys.
 *
 * Rules:
 * - Input is the normal English UI sentence (catalog key).
 * - Output is that sentence in the active locale (`en` returns English).
 * - Missing catalog entry → return the English input unchanged.
 * - Never pass UGC (shop/product names) through this helper.
 * - Brand wordmarks "Motake" / "Motake Admin" stay Latin (do not catalog them).
 */
import type { AppLocale } from "./config";
import { defaultLocale, resolveAppLocale } from "./config";
import enMessages from "./messages/en.json";
import mrMessages from "./messages/mr.json";

export type TranslateValues = Record<string, string | number>;

type MessageCatalog = Record<string, string>;

const catalogs: Record<AppLocale, MessageCatalog> = {
  en: enMessages,
  mr: mrMessages,
};

export function getMessagesForLocale(locale: string | null | undefined): MessageCatalog {
  return catalogs[resolveAppLocale(locale)];
}

function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Convert an English UI string to the given locale.
 * @example translate("mr", "Send for Approval")
 * @example translate("en", "Hello, {name}", { name: "Ravi" })
 */
export function translate(
  locale: string | null | undefined,
  english: string,
  values?: TranslateValues,
): string {
  const resolvedLocale = resolveAppLocale(locale);
  const catalog = catalogs[resolvedLocale] ?? catalogs[defaultLocale];
  const localized = catalog[english];

  if (localized === undefined) {
    return interpolate(english, values);
  }

  return interpolate(localized, values);
}
