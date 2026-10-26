"use client";

import { useTranslate } from "~/hooks/use-translate";
import { PREFERRED_LANGUAGES, type PreferredLanguage } from "~/lib/preferred-language";
import { cn } from "~/lib/utils";

interface PreferredLanguagePickerProps {
  id?: string;
  value: PreferredLanguage;
  onValueChange: (language: PreferredLanguage) => void;
}

/** Marathi, Hindi or English. Only offered when a Customer is added; fixed afterwards. */
export function PreferredLanguagePicker({
  id,
  value,
  onValueChange,
}: PreferredLanguagePickerProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-1.5">
      <div
        id={id}
        role="radiogroup"
        aria-label={tx("common.preferredLanguage.label")}
        className="grid grid-cols-3 gap-1 rounded-full border bg-muted/40 p-1"
      >
        {PREFERRED_LANGUAGES.map((language) => (
          <button
            key={language.value}
            type="button"
            role="radio"
            aria-checked={value === language.value}
            onClick={() => onValueChange(language.value)}
            className={cn(
              "rounded-full px-2 py-1.5 text-sm",
              value === language.value
                ? "bg-card font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tx(language.labelKey)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{tx("common.preferredLanguage.fixedHint")}</p>
    </div>
  );
}
