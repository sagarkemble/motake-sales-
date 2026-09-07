import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { defaultLocale, LOCALE_COOKIE, resolveAppLocale } from "./config";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = resolveAppLocale(cookieStore.get(LOCALE_COOKIE)?.value ?? defaultLocale);

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
