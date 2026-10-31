"use client";

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useTranslate } from "~/hooks/use-translate";
import { PREFERRED_LANGUAGES, type PreferredLanguage } from "~/lib/preferred-language";

interface PreferredLanguagePickerProps {
  id?: string;
  value: PreferredLanguage;
  onValueChange: (language: PreferredLanguage) => void;
}

/** Marathi or English. Only offered when a Customer is added; fixed afterwards. */
export function PreferredLanguagePicker({
  id,
  value,
  onValueChange,
}: PreferredLanguagePickerProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-1.5">
      <ToggleGroup
        id={id}
        type="single"
        variant="outline"
        value={value}
        onValueChange={(nextValue) => nextValue && onValueChange(nextValue as PreferredLanguage)}
        aria-label={tx("common.preferredLanguage.label")}
        className="w-full"
      >
        {PREFERRED_LANGUAGES.map((language) => (
          <ToggleGroupItem
            key={language.value}
            value={language.value}
            className="flex-1 data-[state=on]:bg-accent data-[state=on]:text-brand"
          >
            {tx(language.labelKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">{tx("common.preferredLanguage.fixedHint")}</p>
    </div>
  );
}
