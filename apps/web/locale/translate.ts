/**
 * Shared locale lookup for Motake UI copy.
 *
 * Feature code must call `translate` (server/util) or `useTranslate` → `tx`
 * (client). Keys are dotted paths into nested catalogs (`auth.login.cta`).
 *
 * Rules:
 * - Pass a stable message key, never UGC (shop/product names).
 * - Missing catalog entry → return the key unchanged (after interpolate).
 * - Brand wordmarks "Motake" / "Motake Admin" stay Latin (do not catalog them).
 */
import type { AppLocale } from "./config";
import { defaultLocale, resolveAppLocale } from "./config";
import enMessages from "./messages/en.json";
import mrMessages from "./messages/mr.json";

export type TranslateValues = Record<string, string | number>;

type MessageTree = { [key: string]: string | MessageTree };

const catalogs: Record<AppLocale, MessageTree> = {
  en: enMessages,
  mr: mrMessages,
};

function getMessage(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let current: string | MessageTree | undefined = tree;

  for (const part of parts) {
    if (current === undefined || typeof current === "string") {
      return undefined;
    }
    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
}

export function getMessagesForLocale(locale: string | null | undefined): MessageTree {
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
 * Resolve a dotted message key for the given locale.
 * @example translate("mr", "salesman.handover.cta")
 * @example translate("en", "salesman.catalog.fromPrice", { price: "₹20" })
 */
export function translate(
  locale: string | null | undefined,
  key: string,
  values?: TranslateValues,
): string {
  const resolvedLocale = resolveAppLocale(locale);
  const catalog = catalogs[resolvedLocale] ?? catalogs[defaultLocale];
  const localized = getMessage(catalog, key) ?? getMessage(catalogs[defaultLocale], key);

  if (localized === undefined) {
    return interpolate(key, values);
  }

  return interpolate(localized, values);
}
