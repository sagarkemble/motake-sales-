"use client";

import { PasswordLoginForm } from "./password-login-form";

export function LoginView() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div className="w-full sm:max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-brand text-xl font-bold text-brand-foreground">
            M
          </div>
          <h1 className="text-2xl font-bold text-foreground">Motake Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <PasswordLoginForm />
        </div>
      </div>
    </main>
  );
}
