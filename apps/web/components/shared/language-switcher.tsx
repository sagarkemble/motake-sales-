"use client";

import { CheckIcon, LanguagesIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useTranslate } from "~/hooks/use-translate";
import {
  type AppLocale,
  isAppLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  locales,
} from "~/locale/config";
import { cn } from "~/lib/utils";

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

const localeTriggerLabel: Record<AppLocale, string> = {
  en: "EN",
  mr: "मर",
};

/**
 * Header language switcher (dropdown). Sets NEXT_LOCALE cookie and refreshes.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const tx = useTranslate();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const activeLocale = isAppLocale(locale) ? locale : "en";

  function handleLocaleChange(nextLocale: AppLocale) {
    if (nextLocale === activeLocale) return;
    setLocaleCookie(nextLocale);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 px-2 font-medium", className)}
          disabled={isPending}
          aria-label={tx("Language")}
        >
          <LanguagesIcon className="size-4" />
          <span className="text-xs tracking-wide">{localeTriggerLabel[activeLocale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {locales.map((optionLocale) => {
          const isActive = optionLocale === activeLocale;
          const label = optionLocale === "en" ? tx("English") : tx("Marathi");
          return (
            <DropdownMenuItem
              key={optionLocale}
              disabled={isPending}
              onSelect={() => handleLocaleChange(optionLocale)}
              className="justify-between gap-3"
            >
              <span>{label}</span>
              {isActive ? <CheckIcon className="size-4 text-brand" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
