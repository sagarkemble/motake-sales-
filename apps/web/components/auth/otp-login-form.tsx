"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "~/components/ui/input-otp";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { createOtpLoginStore } from "~/lib/login-store";

const RESEND_COOLDOWN_SECONDS = 60;

const usePhoneOtpLoginStore = createOtpLoginStore();

export function OtpLoginForm() {
  const tx = useTranslate();
  const router = useRouter();
  const { sendOneTimePasscode, verifyOneTimePasscode } = useAuth({ enabled: false });

  const step = usePhoneOtpLoginStore((state) => state.step);
  const contactValue = usePhoneOtpLoginStore((state) => state.contactValue);
  const passcode = usePhoneOtpLoginStore((state) => state.passcode);
  const isSending = usePhoneOtpLoginStore((state) => state.isSending);
  const isVerifying = usePhoneOtpLoginStore((state) => state.isVerifying);
  const formError = usePhoneOtpLoginStore((state) => state.formError);
  const cooldownSeconds = usePhoneOtpLoginStore((state) => state.cooldownSeconds);
  const setContactValue = usePhoneOtpLoginStore((state) => state.setContactValue);
  const setPasscode = usePhoneOtpLoginStore((state) => state.setPasscode);
  const setIsSending = usePhoneOtpLoginStore((state) => state.setIsSending);
  const setIsVerifying = usePhoneOtpLoginStore((state) => state.setIsVerifying);
  const setFormError = usePhoneOtpLoginStore((state) => state.setFormError);
  const setCooldownSeconds = usePhoneOtpLoginStore((state) => state.setCooldownSeconds);
  const goToPasscodeStep = usePhoneOtpLoginStore((state) => state.goToPasscodeStep);
  const goToContactStep = usePhoneOtpLoginStore((state) => state.goToContactStep);

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

  function normalizedPhoneNumber() {
    return `+91${contactValue.trim()}`;
  }

  async function sendPasscode() {
    if (isSending) return;

    setFormError(null);
    setIsSending(true);
    try {
      await sendOneTimePasscode(normalizedPhoneNumber());
      goToPasscodeStep();
      startResendCooldown();
      toast.success(tx("Code sent by SMS"));
    } catch {
      setFormError(tx("Couldn't send a code. Check the details and try again."));
    } finally {
      setIsSending(false);
    }
  }

  async function handleSendPasscode(event: React.FormEvent) {
    event.preventDefault();
    await sendPasscode();
  }

  async function handleVerifyPasscode(event: React.FormEvent) {
    event.preventDefault();
    if (isVerifying || passcode.length < 6) return;

    setFormError(null);
    setIsVerifying(true);
    try {
      await verifyOneTimePasscode({ phone: normalizedPhoneNumber(), passcode });
      toast.success(tx("Signed in"));
      router.push("/");
    } catch {
      setFormError(tx("That code is wrong or expired."));
      setPasscode("");
    } finally {
      setIsVerifying(false);
    }
  }

  if (step === "enter-passcode") {
    return (
      <form onSubmit={handleVerifyPasscode} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="otp-passcode">{tx("6-digit code")}</Label>
          <p className="text-sm text-muted-foreground">Sent to +91 {contactValue}</p>
          <InputOTP
            id="otp-passcode"
            maxLength={6}
            value={passcode}
            onChange={setPasscode}
            autoComplete="one-time-code"
            inputMode="numeric"
            containerClassName="justify-between"
          >
            <InputOTPGroup className="w-full justify-between">
              {Array.from({ length: 6 }, (_, slotIndex) => (
                <InputOTPSlot key={slotIndex} index={slotIndex} className="h-12 w-12 text-base" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={isVerifying || passcode.length < 6}
          className="h-10 bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isVerifying ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {tx("Verify and sign in")}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={goToContactStep}
            className="text-muted-foreground hover:text-foreground"
          >
            {tx("Change number")}
          </button>
          <button
            type="button"
            disabled={cooldownSeconds > 0 || isSending}
            onClick={() => void sendPasscode()}
            className="text-brand disabled:text-muted-foreground disabled:opacity-60"
          >
            {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : tx("Resend code")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendPasscode} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="otp-contact">{tx("Phone number")}</Label>
        <div className="flex h-10 items-center rounded-md border border-input bg-transparent pl-3 focus-within:ring-[3px] focus-within:ring-ring/50">
          <span className="text-sm text-muted-foreground">+91</span>
          <Input
            id="otp-contact"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder={tx("10-digit mobile number")}
            value={contactValue}
            onChange={(event) =>
              setContactValue(event.target.value.replace(/\D/g, "").slice(0, 10))
            }
            required
            className="h-10 border-none pl-2 shadow-none focus-visible:ring-0"
          />
        </div>
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
        {tx("Send code")}
      </Button>
    </form>
  );
}
