import { resolveAppLocale, type AppLocale } from "~/locale/config";

/** Map app locale → BCP 47 tag for INR formatting. */
export function toMoneyLocale(appLocale?: string | null): string {
  return resolveAppLocale(appLocale) === "mr" ? "mr-IN" : "en-IN";
}

/** Format INR amounts for Motake UI (e.g. ₹1,140.00). */
export function formatInr(amount: number, appLocale?: string | null): string {
  return new Intl.NumberFormat(toMoneyLocale(appLocale), {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact INR for KPI cards (e.g. ₹48,260). */
export function formatInrCompact(amount: number, appLocale?: string | null): string {
  return new Intl.NumberFormat(toMoneyLocale(appLocale), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function lineTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100;
}

export type { AppLocale };
