"use client";

import { LanguageSwitcher } from "~/components/shared/language-switcher";
import { useTranslate } from "~/hooks/use-translate";

import { PasswordLoginForm } from "./password-login-form";

export function LoginView() {
  const tx = useTranslate();

  return (
    <main className="bg-dairy-doodle relative flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full sm:max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-brand text-xl font-bold text-brand-foreground shadow-sm">
            M
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Motake Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tx("auth.login.title")}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <PasswordLoginForm />
        </div>
      </div>
    </main>
  );
}
