import { resolveAppLocale, type AppLocale } from "~/locale/config";

/** Map app locale → BCP 47 tag for INR formatting. */
export function toMoneyLocale(appLocale?: string | null): string {
  return resolveAppLocale(appLocale) === "mr" ? "mr-IN" : "en-IN";
}

/** Format INR from integer paise for Motake UI (e.g. 114000 → ₹1,140.00). The API carries paise. */
export function formatPaise(paise: number, appLocale?: string | null): string {
  return new Intl.NumberFormat(toMoneyLocale(appLocale), {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** Compact INR from paise for KPI tiles (e.g. 4826000 → ₹48,260). */
export function formatPaiseCompact(paise: number, appLocale?: string | null): string {
  return new Intl.NumberFormat(toMoneyLocale(appLocale), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}

export type { AppLocale };
