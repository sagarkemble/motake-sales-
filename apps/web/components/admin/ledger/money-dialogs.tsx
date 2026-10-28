"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Spinner } from "~/components/ui/spinner";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useLedger, type LedgerSummary, type PaymentMode } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { isOutcomeUnknown } from "~/lib/refusal";
import { paiseToRupeeInput, parseRupeesToPaise } from "~/lib/rupee-input";

import { OutcomeUnknownAlert, RefusalAlert, useBalanceText } from "./ledger-shared";
import {
  AmountField,
  ModeField,
  MoneyReasonField,
  PreviewLine,
  ReferenceField,
  RefundNotInAdvance,
  amountErrorKey,
  moneyRefusalMessage,
  toBalance,
} from "./money-paper-parts";

export type MoneyAddKind = "payment" | "refund";

/** What the Ledger highlights once an Add lands. */
export interface MoneyAdded {
  kind: MoneyAddKind;
  id: string;
}

/**
 * Ledger header → Add → Payment or Refund, in a dialog. The form mounts on each open, so every
 * open gets its own idempotency key: a double-click or a retry after a lost answer from the same
 * dialog returns the first Payment or Refund instead of recording a second one.
 */
export function AddMoneyDialog({
  kind,
  onOpenChange,
  summary,
  onAdded,
}: {
  kind: MoneyAddKind | null;
  onOpenChange: (open: boolean) => void;
  summary: LedgerSummary;
  onAdded: (added: MoneyAdded) => void;
}) {
  const tx = useTranslate();
  return (
    <Dialog open={kind != null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 rounded-2xl p-0 sm:max-w-md">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          {kind && (
            <div className="flex flex-col gap-4 p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>
                  {kind === "payment"
                    ? tx("admin.ledger.money.addPayment.title")
                    : tx("admin.ledger.money.addRefund.title")}
                </DialogTitle>
                <DialogDescription>
                  {kind === "payment"
                    ? tx("admin.ledger.money.addPayment.description")
                    : tx("admin.ledger.money.addRefund.description")}
                </DialogDescription>
              </DialogHeader>
              {kind === "payment" ? (
                <AddPaymentForm
                  summary={summary}
                  onAdded={onAdded}
                  onClose={() => onOpenChange(false)}
                />
              ) : (
                <AddRefundForm
                  summary={summary}
                  onAdded={onAdded}
                  onClose={() => onOpenChange(false)}
                />
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface AddFormProps {
  summary: LedgerSummary;
  onAdded: (added: MoneyAdded) => void;
  onClose: () => void;
}

function useAddFields(initialMode: PaymentMode) {
  const [mode, setMode] = useState<PaymentMode>(initialMode);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  // One key per open dialog.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return {
    mode,
    setMode,
    amount,
    setAmount,
    reference,
    setReference,
    reason,
    setReason,
    refusal,
    setRefusal,
    outcomeUnknown,
    setOutcomeUnknown,
    idempotencyKey,
    amountPaise: parseRupeesToPaise(amount),
  };
}

function AddFooter({
  label,
  disabled,
  busy,
  onSubmit,
  onClose,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const tx = useTranslate();
  return (
    <DialogFooter>
      <Button variant="outline" className="rounded-full" disabled={busy} onClick={onClose}>
        {tx("common.actions.cancel")}
      </Button>
      <Button
        disabled={disabled || busy}
        onClick={onSubmit}
        className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {busy && <Spinner />}
        {busy ? tx("admin.ledger.saving") : label}
      </Button>
    </DialogFooter>
  );
}

function AddPaymentForm({ summary, onAdded, onClose }: AddFormProps) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const balanceText = useBalanceText();
  const fields = useAddFields("cash");
  const { addPaymentAsync, isAddingPayment } = useLedger({ customerId: summary.customer.id });
  const balance = summary.footer.closing;
  const { amountPaise } = fields;
  const after = amountPaise != null ? toBalance(balance.balancePaise - amountPaise) : null;
  const amountError = amountErrorKey(fields.amount, false);
  const canSubmit = amountPaise != null && fields.reason.trim() !== "" && !isAddingPayment;

  async function handleSubmit() {
    if (!canSubmit || amountPaise == null) return;
    fields.setRefusal(null);
    fields.setOutcomeUnknown(false);
    try {
      const reference = fields.reference.trim();
      const result = await addPaymentAsync({
        customerId: summary.customer.id,
        mode: fields.mode,
        keptPaise: amountPaise,
        reference: reference || undefined,
        reason: fields.reason.trim(),
        idempotencyKey: fields.idempotencyKey,
      });
      toast.success(
        tx("admin.ledger.money.addPayment.done", {
          number: result.data.number,
          mode: tx(`admin.ledger.money.modes.${fields.mode}`),
          amount: formatPaise(result.data.keptPaise),
        }),
      );
      onAdded({ kind: "payment", id: result.data.paymentId });
    } catch (error) {
      if (isOutcomeUnknown(error)) fields.setOutcomeUnknown(true);
      else fields.setRefusal(moneyRefusalMessage(tx, formatPaise, error));
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {tx("admin.ledger.money.nowBalance", {
          shopName: summary.customer.shopName,
          balance: balanceText(balance),
        })}
      </p>
      <ModeField
        id="add-payment-mode"
        value={fields.mode}
        onChange={fields.setMode}
        disabled={isAddingPayment}
      />
      <AmountField
        id="add-payment-amount"
        label={tx("admin.ledger.money.addPayment.kept")}
        value={fields.amount}
        onChange={fields.setAmount}
        disabled={isAddingPayment}
        error={amountError ? tx(amountError) : null}
        hint={tx("admin.ledger.money.addPayment.keptHint")}
      />
      <ReferenceField
        id="add-payment-reference"
        value={fields.reference}
        onChange={fields.setReference}
        disabled={isAddingPayment}
      />
      <MoneyReasonField
        id="add-payment-reason"
        value={fields.reason}
        onChange={fields.setReason}
        disabled={isAddingPayment}
        placeholder={tx("admin.ledger.money.addPayment.reasonPlaceholder")}
      />
      <PreviewLine>
        {amountPaise != null && after ? (
          <>
            {tx("admin.ledger.money.addPayment.preview", {
              amount: formatPaise(amountPaise),
              balance: balanceText(after),
            })}
            {balance.state !== "advance" && after.state === "advance" && (
              <> {tx("admin.ledger.money.addPayment.becomesAdvance")}</>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            {tx("admin.ledger.money.addPayment.previewEmpty")}
          </span>
        )}
      </PreviewLine>
      {fields.outcomeUnknown && (
        <OutcomeUnknownAlert message={tx("admin.ledger.money.outcomeUnknown.payment")} />
      )}
      {fields.refusal && <RefusalAlert message={fields.refusal} />}
      <AddFooter
        label={tx("admin.ledger.money.addPayment.submit")}
        disabled={!canSubmit}
        busy={isAddingPayment}
        onSubmit={handleSubmit}
        onClose={onClose}
      />
    </div>
  );
}

function AddRefundForm({ summary, onAdded, onClose }: AddFormProps) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const balanceText = useBalanceText();
  const fields = useAddFields("upi");
  const { addRefundAsync, isAddingRefund } = useLedger({ customerId: summary.customer.id });
  const balance = summary.footer.closing;

  if (balance.state !== "advance") {
    return (
      <div className="grid gap-3">
        <RefundNotInAdvance balance={balance} />
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>
            {tx("common.actions.cancel")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const advancePaise = balance.amountPaise;
  const { amountPaise } = fields;
  const over = amountPaise != null && amountPaise > advancePaise;
  const amountError = over
    ? tx("admin.ledger.money.addRefund.overAdvance", { amount: formatPaise(advancePaise) })
    : (() => {
        const key = amountErrorKey(fields.amount, false);
        return key ? tx(key) : null;
      })();
  const canSubmit = amountPaise != null && !over && fields.reason.trim() !== "" && !isAddingRefund;

  async function handleSubmit() {
    if (!canSubmit || amountPaise == null) return;
    fields.setRefusal(null);
    fields.setOutcomeUnknown(false);
    try {
      const reference = fields.reference.trim();
      const result = await addRefundAsync({
        customerId: summary.customer.id,
        mode: fields.mode,
        amountPaise,
        reference: reference || undefined,
        reason: fields.reason.trim(),
        idempotencyKey: fields.idempotencyKey,
      });
      toast.success(
        tx("admin.ledger.money.addRefund.done", {
          number: result.data.number,
          mode: tx(`admin.ledger.money.modes.${fields.mode}`),
          amount: formatPaise(result.data.amountPaise),
        }),
      );
      onAdded({ kind: "refund", id: result.data.refundId });
    } catch (error) {
      if (isOutcomeUnknown(error)) fields.setOutcomeUnknown(true);
      else fields.setRefusal(moneyRefusalMessage(tx, formatPaise, error));
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {tx("admin.ledger.money.addRefund.advanceNow", {
          shopName: summary.customer.shopName,
          amount: formatPaise(advancePaise),
        })}
      </p>
      <ModeField
        id="add-refund-mode"
        value={fields.mode}
        onChange={fields.setMode}
        disabled={isAddingRefund}
      />
      <AmountField
        id="add-refund-amount"
        label={tx("admin.ledger.money.addRefund.amount")}
        value={fields.amount}
        onChange={fields.setAmount}
        disabled={isAddingRefund}
        error={amountError}
        hint={tx("admin.ledger.money.addRefund.upTo", { amount: formatPaise(advancePaise) })}
        action={
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0 text-brand"
            disabled={isAddingRefund}
            onClick={() => fields.setAmount(paiseToRupeeInput(advancePaise))}
          >
            {tx("admin.ledger.money.addRefund.wholeAdvance")}
          </Button>
        }
      />
      <ReferenceField
        id="add-refund-reference"
        value={fields.reference}
        onChange={fields.setReference}
        disabled={isAddingRefund}
      />
      <MoneyReasonField
        id="add-refund-reason"
        value={fields.reason}
        onChange={fields.setReason}
        disabled={isAddingRefund}
        placeholder={tx("admin.ledger.money.addRefund.reasonPlaceholder")}
      />
      <PreviewLine>
        {amountPaise != null && !over ? (
          tx("admin.ledger.money.addRefund.preview", {
            amount: formatPaise(amountPaise),
            balance: balanceText(toBalance(balance.balancePaise + amountPaise)),
          })
        ) : (
          <span className="text-muted-foreground">
            {tx("admin.ledger.money.addRefund.previewEmpty")}
          </span>
        )}
      </PreviewLine>
      {fields.outcomeUnknown && (
        <OutcomeUnknownAlert message={tx("admin.ledger.money.outcomeUnknown.refund")} />
      )}
      {fields.refusal && <RefusalAlert message={fields.refusal} />}
      <AddFooter
        label={tx("admin.ledger.money.addRefund.submit")}
        disabled={!canSubmit}
        busy={isAddingRefund}
        onSubmit={handleSubmit}
        onClose={onClose}
      />
    </div>
  );
}
