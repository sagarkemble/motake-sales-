"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { MagicLinkLoginForm } from "./magic-link-login-form";
import { OtpLoginForm } from "./otp-login-form";
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
          <Tabs defaultValue="password">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="phone">OTP</TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="mt-5">
              <PasswordLoginForm />
            </TabsContent>
            <TabsContent value="email" className="mt-5">
              <MagicLinkLoginForm />
            </TabsContent>
            <TabsContent value="phone" className="mt-5">
              <OtpLoginForm />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
