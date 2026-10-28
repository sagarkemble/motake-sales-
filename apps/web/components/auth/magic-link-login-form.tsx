"use client";

import { Loader2Icon, MailCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { useMagicLinkLoginStore } from "~/lib/login-store";

const RESEND_COOLDOWN_SECONDS = 60;

export function MagicLinkLoginForm() {
  const tx = useTranslate();
  const { sendMagicLink } = useAuth({ enabled: false });

  const step = useMagicLinkLoginStore((state) => state.step);
  const email = useMagicLinkLoginStore((state) => state.email);
  const isSending = useMagicLinkLoginStore((state) => state.isSending);
  const formError = useMagicLinkLoginStore((state) => state.formError);
  const cooldownSeconds = useMagicLinkLoginStore((state) => state.cooldownSeconds);
  const setEmail = useMagicLinkLoginStore((state) => state.setEmail);
  const setIsSending = useMagicLinkLoginStore((state) => state.setIsSending);
  const setFormError = useMagicLinkLoginStore((state) => state.setFormError);
  const setCooldownSeconds = useMagicLinkLoginStore((state) => state.setCooldownSeconds);
  const goToLinkSentStep = useMagicLinkLoginStore((state) => state.goToLinkSentStep);
  const goToEmailStep = useMagicLinkLoginStore((state) => state.goToEmailStep);

  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    return () => clearInterval(cooldownIntervalRef.current);
  }, []);

  function startResendCooldown() {
    setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds((secondsLeft) => {
        if (secondsLeft <= 1) {
          clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return secondsLeft - 1;
      });
    }, 1000);
  }

  async function sendLink() {
    if (isSending) return;

    setFormError(null);
    setIsSending(true);
    try {
      await sendMagicLink(email.trim());
      goToLinkSentStep();
      startResendCooldown();
      toast.success(tx("auth.magicLink.sent"));
    } catch {
      setFormError(tx("auth.magicLink.sendFailed"));
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendLink(event: React.FormEvent) {
    event.preventDefault();
    await sendLink();
  }

  if (step === "link-sent") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
          <MailCheckIcon className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{tx("auth.magicLink.checkEmail")}</p>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to {email}. Open it on this device to sign in.
          </p>
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="flex w-full items-center justify-between text-sm">
          <button
            type="button"
            onClick={goToEmailStep}
            className="rounded-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:text-foreground"
          >
            {tx("auth.magicLink.changeEmail")}
          </button>
          <button
            type="button"
            disabled={cooldownSeconds > 0 || isSending}
            onClick={() => void sendLink()}
            className="rounded-sm text-brand outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:opacity-60"
          >
            {cooldownSeconds > 0
              ? tx("auth.otp.resendIn", { seconds: cooldownSeconds })
              : tx("auth.magicLink.resend")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSendLink} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="magic-link-email">{tx("common.fields.email")}</Label>
        <Input
          id="magic-link-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@motake.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="h-10"
        />
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isSending}
        className="h-10 bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {isSending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {tx("auth.magicLink.cta")}
      </Button>
    </form>
  );
}
