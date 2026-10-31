"use client";

import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "~/components/ui/input-otp";
import { Label } from "~/components/ui/label";
import { useAuth } from "~/hooks/use-auth";
import { useTranslate } from "~/hooks/use-translate";
import { isNetworkError } from "~/lib/get-error-message";
import { createOtpLoginStore } from "~/lib/login-store";

const RESEND_COOLDOWN_SECONDS = 60;

const usePhoneUpdateStore = createOtpLoginStore();

interface UpdatePhoneNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdatePhoneNumberDialog({ open, onOpenChange }: UpdatePhoneNumberDialogProps) {
  const tx = useTranslate();
  const { requestPhoneNumberChange, confirmPhoneNumberChange } = useAuth({ enabled: false });

  const step = usePhoneUpdateStore((state) => state.step);
  const contactValue = usePhoneUpdateStore((state) => state.contactValue);
  const passcode = usePhoneUpdateStore((state) => state.passcode);
  const isSending = usePhoneUpdateStore((state) => state.isSending);
  const isVerifying = usePhoneUpdateStore((state) => state.isVerifying);
  const formError = usePhoneUpdateStore((state) => state.formError);
  const cooldownSeconds = usePhoneUpdateStore((state) => state.cooldownSeconds);
  const setContactValue = usePhoneUpdateStore((state) => state.setContactValue);
  const setPasscode = usePhoneUpdateStore((state) => state.setPasscode);
  const setIsSending = usePhoneUpdateStore((state) => state.setIsSending);
  const setIsVerifying = usePhoneUpdateStore((state) => state.setIsVerifying);
  const setFormError = usePhoneUpdateStore((state) => state.setFormError);
  const setCooldownSeconds = usePhoneUpdateStore((state) => state.setCooldownSeconds);
  const goToPasscodeStep = usePhoneUpdateStore((state) => state.goToPasscodeStep);
  const goToContactStep = usePhoneUpdateStore((state) => state.goToContactStep);

  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  function resetDialogState() {
    clearInterval(cooldownIntervalRef.current);
    goToContactStep();
    setContactValue("");
    setCooldownSeconds(0);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetDialogState();
    onOpenChange(nextOpen);
  }

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

  function fullPhoneNumber() {
    return `+91${contactValue.trim()}`;
  }

  async function sendPasscode() {
    if (isSending) return;

    setFormError(null);
    setIsSending(true);
    try {
      await requestPhoneNumberChange(fullPhoneNumber());
      goToPasscodeStep();
      startResendCooldown();
      toast.success(tx("auth.otp.codeSent"));
    } catch (error) {
      setFormError(
        isNetworkError(error) ? tx("common.errors.network") : tx("account.phone.sendFailed"),
      );
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
      await confirmPhoneNumberChange({ phone: fullPhoneNumber(), passcode });
      toast.success(tx("account.phone.updated"));
      handleOpenChange(false);
    } catch (error) {
      setFormError(
        isNetworkError(error) ? tx("common.errors.network") : tx("auth.otp.invalidOrExpired"),
      );
      setPasscode("");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("account.phone.title")}</DialogTitle>
        </DialogHeader>

        {step === "enter-passcode" ? (
          <form onSubmit={handleVerifyPasscode} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone-update-passcode">{tx("auth.otp.codeLabel")}</Label>
              <p className="text-sm text-muted-foreground">
                {tx("auth.otp.sentTo", { phone: contactValue })}
              </p>
              <InputOTP
                id="phone-update-passcode"
                maxLength={6}
                value={passcode}
                onChange={setPasscode}
                autoComplete="one-time-code"
                inputMode="numeric"
                containerClassName="w-full"
              >
                <InputOTPGroup className="w-full justify-between">
                  {Array.from({ length: 6 }, (_, slotIndex) => (
                    <InputOTPSlot
                      key={slotIndex}
                      index={slotIndex}
                      className="h-12 w-auto min-w-0 flex-1 text-base"
                    />
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
              className="h-10 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isVerifying ? tx("common.status.pleaseWait") : tx("account.phone.verifyCta")}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="link"
                onClick={goToContactStep}
                className="h-auto p-0 text-muted-foreground hover:text-foreground"
              >
                {tx("auth.otp.changeNumber")}
              </Button>
              <Button
                type="button"
                variant="link"
                disabled={cooldownSeconds > 0 || isSending}
                onClick={() => void sendPasscode()}
                className="h-auto p-0 text-brand disabled:text-muted-foreground"
              >
                {cooldownSeconds > 0
                  ? tx("auth.otp.resendIn", { seconds: cooldownSeconds })
                  : tx("auth.otp.resend")}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSendPasscode} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone-update-contact">{tx("account.phone.newLabel")}</Label>
              <div className="flex h-10 items-center rounded-xl border border-input bg-muted-soft pl-3 focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="text-sm text-muted-foreground">+91</span>
                <Input
                  id="phone-update-contact"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder={tx("auth.otp.phonePlaceholder")}
                  value={contactValue}
                  onChange={(event) =>
                    setContactValue(event.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  required
                  className="h-10 border-none bg-transparent pl-2 shadow-none focus-visible:ring-0"
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
              disabled={isSending || contactValue.trim().length < 10}
              className="h-10 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isSending ? tx("common.status.pleaseWait") : tx("auth.otp.sendCta")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
