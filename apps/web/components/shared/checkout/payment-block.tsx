"use client";

import { InfoIcon, QrCodeIcon, UndoIcon, WalletIcon } from "lucide-react";
import { useState } from "react";

import { BalanceChip, BalanceText } from "~/components/shared/checkout/balance-text";
import { PaymentScannerDialog } from "~/components/shared/checkout/payment-scanner-dialog";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Separator } from "~/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import {
  cleanReceivedText,
  PAYMENT_MODES,
  paymentMaths,
  type OverpayChoice,
  type PaymentContext,
  type PaymentDraft,
  type PaymentMode,
} from "~/lib/checkout-payment";
import { paiseToRupeeInput } from "~/lib/rupee-input";
import { cn } from "~/lib/utils";

interface PaymentBlockProps {
  context: PaymentContext;
  draft: PaymentDraft;
  onChange: (draft: PaymentDraft) => void;
  disabled?: boolean;
}

/**
 * Compact Payment form + table, shared by Book Now, fulfil (salesman and Admin) and field
 * Payment. The preview mirrors the server's overpay rules.
 */
export function PaymentBlock({ context, draft, onChange, disabled = false }: PaymentBlockProps) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const maths = paymentMaths(context, draft);
  const { preview, requiredPaise, canReturnChange } = maths;
  const isField = context.billTotalPaise === null;
  const extraPaise = Math.max(0, preview.receivedPaise - requiredPaise);

  function update(patch: Partial<PaymentDraft>) {
    onChange({ ...draft, ...patch });
  }

  function setMode(mode: PaymentMode) {
    update({ mode, overpay: mode === "cash" ? draft.overpay : null });
  }

  const amountChips: { key: string; label: string; paise: number }[] = [];
  if (requiredPaise > 0)
    amountChips.push({
      key: "toClear",
      label: tx("checkout.payment.chip.toClear", { amount: formatPaise(requiredPaise) }),
      paise: requiredPaise,
    });
  if (context.billTotalPaise !== null && context.billTotalPaise !== requiredPaise)
    amountChips.push({
      key: "thisBill",
      label: tx("checkout.payment.chip.thisBill", { amount: formatPaise(context.billTotalPaise) }),
      paise: context.billTotalPaise,
    });
  if (!isField)
    amountChips.push({
      key: "nothingNow",
      label: tx("checkout.payment.chip.nothingNow", { amount: formatPaise(0) }),
      paise: 0,
    });

  const previewRows = [
    { key: "received", value: preview.receivedPaise },
    { key: "kept", value: preview.keptPaise },
    { key: "returned", value: preview.returnedPaise },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border bg-card p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{tx("checkout.payment.balanceNow")}</span>
          <BalanceChip balancePaise={context.balanceBeforePaise} />
        </div>
        {!isField && (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{tx("checkout.payment.thisBill")}</span>
            <span className="tabular-nums">+ {formatPaise(context.billTotalPaise ?? 0)}</span>
          </div>
        )}
        <Separator className="my-2" />
        <div className="flex items-center justify-between gap-2 font-semibold">
          <span>{tx("checkout.payment.toClear")}</span>
          <span className="tabular-nums text-brand">{formatPaise(requiredPaise)}</span>
        </div>
        {requiredPaise === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tx(
              isField
                ? "checkout.payment.nothingPendingField"
                : "checkout.payment.advanceCoversBill",
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{tx("checkout.payment.mode")}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={draft.mode}
            disabled={disabled}
            onValueChange={(value) => value && setMode(value as PaymentMode)}
            className="w-full sm:w-fit"
          >
            {PAYMENT_MODES.map((mode) => (
              <ToggleGroupItem
                key={mode}
                value={mode}
                className="flex-1 px-4 data-[state=on]:bg-accent data-[state=on]:text-brand"
              >
                {tx(`checkout.payment.modes.${mode}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-received" className="text-xs">
            {tx("checkout.payment.received")}
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              ₹
            </span>
            <Input
              id="payment-received"
              inputMode="decimal"
              value={draft.receivedText}
              disabled={disabled}
              onChange={(event) =>
                update({ receivedText: cleanReceivedText(event.target.value), overpay: null })
              }
              placeholder="0"
              className="h-11 rounded-xl pl-8 text-base tabular-nums"
              aria-label={tx("checkout.payment.receivedA11y")}
            />
          </div>
        </div>
      </div>

      {amountChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {amountChips.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-7 rounded-full text-xs"
              onClick={() =>
                update({ receivedText: paiseToRupeeInput(chip.paise), overpay: null })
              }
            >
              {chip.label}
            </Button>
          ))}
        </div>
      )}

      {draft.mode !== "cash" && (
        <div className="flex flex-col gap-2">
          {draft.mode === "upi" && (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full gap-3 rounded-2xl border-brand/30 bg-accent text-base font-semibold text-brand-deep hover:bg-accent/70"
              onClick={() => setIsScannerOpen(true)}
            >
              <QrCodeIcon className="size-5" />
              {tx("checkout.payment.openScanner")}
            </Button>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-reference" className="text-xs">
              {tx(
                draft.mode === "upi"
                  ? "checkout.payment.referenceUpi"
                  : "checkout.payment.referenceBank",
              )}{" "}
              <span className="text-muted-foreground">{tx("checkout.payment.optional")}</span>
            </Label>
            <Input
              id="payment-reference"
              value={draft.reference}
              maxLength={128}
              disabled={disabled}
              onChange={(event) => update({ reference: event.target.value })}
              placeholder={tx(
                draft.mode === "upi"
                  ? "checkout.payment.referenceUpiPlaceholder"
                  : "checkout.payment.referenceBankPlaceholder",
              )}
              className="h-10 rounded-xl"
            />
          </div>
        </div>
      )}

      {draft.mode !== "cash" && extraPaise > 0 && (
        <Alert className="border-sky-500/30 bg-sky-500/5">
          <InfoIcon className="text-sky-700" />
          <AlertDescription className="text-sky-900">
            {tx("checkout.payment.extraKeptAsAdvance", {
              extra: formatPaise(extraPaise),
              mode: tx(`checkout.payment.modes.${draft.mode}`),
            })}
          </AlertDescription>
        </Alert>
      )}

      {draft.mode === "cash" && preview.isOverpay && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-2xl border p-3",
            preview.needsOverpayChoice ? "border-amber-500/50 bg-amber-500/5" : "border-border",
          )}
        >
          <p className="text-sm font-medium">
            {tx("checkout.payment.overpayQuestion", { extra: formatPaise(extraPaise) })}
          </p>
          <RadioGroup
            value={draft.overpay ?? ""}
            disabled={disabled}
            onValueChange={(value) => update({ overpay: value as OverpayChoice })}
            className="flex flex-col gap-2"
          >
            {(
              [
                {
                  value: "return_change" as const,
                  icon: UndoIcon,
                  title: tx("checkout.payment.returnChange", { extra: formatPaise(extraPaise) }),
                  hint: tx("checkout.payment.returnChangeHint", {
                    kept: formatPaise(requiredPaise),
                    extra: formatPaise(extraPaise),
                  }),
                },
                {
                  value: "keep_advance" as const,
                  icon: WalletIcon,
                  title: tx("checkout.payment.keepAdvance", { extra: formatPaise(extraPaise) }),
                  hint: tx("checkout.payment.keepAdvanceHint", {
                    received: formatPaise(preview.receivedPaise),
                  }),
                },
              ]
            )
              .filter((option) => canReturnChange || option.value !== "return_change")
              .map((option) => (
              <Label
                key={option.value}
                htmlFor={`overpay-${option.value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal",
                  draft.overpay === option.value ? "border-brand bg-accent/50" : "bg-background",
                )}
              >
                <RadioGroupItem
                  id={`overpay-${option.value}`}
                  value={option.value}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <option.icon className="size-3.5" />
                    {option.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>
      )}

      <div className="rounded-xl border text-sm">
        {previewRows.map((row) => (
          <div key={row.key} className="flex justify-between border-b px-3 py-1.5">
            <span className="text-muted-foreground">
              {tx(`checkout.payment.preview.${row.key}`)}
            </span>
            <span className="tabular-nums">{formatPaise(row.value)}</span>
          </div>
        ))}
        <div className="flex justify-between bg-muted/30 px-3 py-1.5 font-medium">
          <span>{tx("checkout.payment.preview.balanceAfter")}</span>
          <BalanceText balancePaise={preview.balanceAfterPaise} />
        </div>
      </div>

      <PaymentScannerDialog open={isScannerOpen} onOpenChange={setIsScannerOpen} />
    </div>
  );
}
