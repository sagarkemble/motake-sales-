import type { RouterOutputs } from "@repo/trpc/client";

export type PreferredLanguage = RouterOutputs["customers"]["getById"]["data"]["preferredLanguage"];

// Marathi first: it is the default for a new Customer.
export const PREFERRED_LANGUAGES: { value: PreferredLanguage; labelKey: string }[] = [
  { value: "mr", labelKey: "common.preferredLanguage.mr" },
  { value: "hi", labelKey: "common.preferredLanguage.hi" },
  { value: "en", labelKey: "common.preferredLanguage.en" },
];

export function preferredLanguageLabelKey(language: PreferredLanguage): string {
  return `common.preferredLanguage.${language}`;
}
