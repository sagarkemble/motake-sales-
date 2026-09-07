import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  defaultLocale,
  isAppLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
} from "~/locale/config";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;

  if (!isAppLocale(cookieLocale)) {
    response.cookies.set(LOCALE_COOKIE, defaultLocale, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
