"use client";

import { AlertCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { DialogFooter } from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { useFormatMoney } from "~/hooks/use-format-money";
import {
  useMoneyPaper,
  type PaymentMode,
  type PaymentPaper,
  type RefundPaper,
} from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { isOutcomeUnknown, refusalOf } from "~/lib/refusal";
import { paiseToRupeeInput } from "~/lib/rupee-input";

import { OutcomeUnknownAlert, RefusalAlert, useBalanceText } from "./ledger-shared";
import {
  AmountField,
  ModeField,
  MoneyReasonField,
  PreviewLine,
  ReferenceField,
  amountErrorKey,
  moneyRefusalMessage,
  parseRupeesAllowZero,
  toBalance,
} from "./money-paper-parts";

// A Correct form is mounted per open (and again on Reload) from the paper as it was then; its
// expectedLatestEventId is that paper's latest event, so a Correct someone saved meanwhile makes
// this save stale_version instead of silently overwriting it.

function useCorrectFields(initial: {
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
  latestEventId: string;
}) {
  const [baseline] = useState(initial);
  const [amount, setAmount] = useState(paiseToRupeeInput(initial.amountPaise));
  const [mode, setMode] = useState<PaymentMode>(initial.mode);
  const [reference, setReference] = useState(initial.reference ?? "");
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<{ message: string; stale: boolean } | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const amountPaise = parseRupeesAllowZero(amount);
  const differencePaise = amountPaise == null ? 0 : amountPaise - baseline.amountPaise;
  const referenceAfter = reference.trim() || null;
  const changed =
    amountPaise != null &&
    (differencePaise !== 0 || mode !== baseline.mode || referenceAfter !== baseline.reference);
  return {
    baseline,
    amount,
    setAmount,
    mode,
    setMode,
    reference,
    setReference,
    referenceAfter,
    reason,
    setReason,
    refusal,
    setRefusal,
    outcomeUnknown,
    setOutcomeUnknown,
    amountPaise,
    differencePaise,
    changed,
  };
}

type CorrectFields = ReturnType<typeof useCorrectFields>;

function CorrectFeedback({ fields, onReload }: { fields: CorrectFields; onReload: () => void }) {
  const tx = useTranslate();
  return (
    <>
      {fields.outcomeUnknown && (
        <OutcomeUnknownAlert message={tx("admin.ledger.money.outcomeUnknown.correct")} />
      )}
      {fields.refusal &&
        (fields.refusal.stale ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{tx("admin.ledger.notSaved")}</AlertTitle>
            <AlertDescription>
              <p>{fields.refusal.message}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={onReload}>
                {tx("admin.ledger.money.correct.reload")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <RefusalAlert message={fields.refusal.message} />
        ))}
      {fields.outcomeUnknown && (
        <Button size="sm" variant="outline" className="w-fit" onClick={onReload}>
          {tx("admin.ledger.money.correct.reload")}
        </Button>
      )}
    </>
  );
}

function CorrectFooter({
  disabled,
  busy,
  onSubmit,
  onClose,
}: {
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
        {busy ? tx("admin.ledger.saving") : tx("admin.ledger.money.correct.submit")}
      </Button>
    </DialogFooter>
  );
}

function useHandleCorrectError(fields: CorrectFields) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  return (error: unknown) => {
    if (isOutcomeUnknown(error)) {
      fields.setOutcomeUnknown(true);
      return;
    }
    fields.setRefusal({
      message: moneyRefusalMessage(tx, formatPaise, error),
      stale: refusalOf(error)?.reason === "stale_version",
    });
  };
}

export function CorrectPaymentForm({
  paper,
  onSaved,
  onClose,
  onReload,
}: {
  paper: PaymentPaper;
  onSaved: () => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const balanceText = useBalanceText();
  const { payment } = paper;
  const fields = useCorrectFields({
    amountPaise: payment.keptPaise,
    mode: payment.mode,
    reference: payment.reference,
    latestEventId: paper.latestEventId,
  });
  const { correctPaymentAsync, isCorrectingPayment } = useMoneyPaper();
  const handleError = useHandleCorrectError(fields);
  const { differencePaise, amountPaise } = fields;
  const amountError = amountErrorKey(fields.amount, true);
  const balanceAfter = toBalance(paper.balance.balancePaise - differencePaise);
  const canSubmit = fields.changed && fields.reason.trim() !== "" && !isCorrectingPayment;

  async function handleSubmit() {
    if (!canSubmit || amountPaise == null) return;
    fields.setRefusal(null);
    fields.setOutcomeUnknown(false);
    try {
      const result = await correctPaymentAsync({
        paymentId: payment.id,
        expectedLatestEventId: fields.baseline.latestEventId,
        keptPaise: amountPaise,
        mode: fields.mode,
        reference: fields.referenceAfter,
        reason: fields.reason.trim(),
      });
      const difference = result.data.differencePaise;
      toast.success(
        difference === 0
          ? tx("admin.ledger.money.correct.savedHistory", { number: result.data.number })
          : tx("admin.ledger.money.correct.savedAmount", {
              number: result.data.number,
              type: tx("admin.ledger.rowTypes.payment_adjusted"),
              side: tx(
                difference < 0 ? "admin.ledger.columns.debit" : "admin.ledger.columns.credit",
              ),
              amount: formatPaise(Math.abs(difference)),
            }),
      );
      onSaved();
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <div className="grid gap-4">
      <ModeField
        id="correct-payment-mode"
        value={fields.mode}
        onChange={fields.setMode}
        disabled={isCorrectingPayment}
      />
      <AmountField
        id="correct-payment-kept"
        label={tx("admin.ledger.money.addPayment.kept")}
        value={fields.amount}
        onChange={fields.setAmount}
        disabled={isCorrectingPayment}
        error={amountError ? tx(amountError) : null}
        hint={
          payment.returnedPaise > 0
            ? tx("admin.ledger.money.correct.keptReturnedHint", {
                amount: formatPaise(payment.returnedPaise),
              })
            : tx("admin.ledger.money.correct.keptZeroHint")
        }
      />
      <ReferenceField
        id="correct-payment-reference"
        value={fields.reference}
        onChange={fields.setReference}
        disabled={isCorrectingPayment}
      />
      <MoneyReasonField
        id="correct-payment-reason"
        value={fields.reason}
        onChange={fields.setReason}
        disabled={isCorrectingPayment}
        placeholder={tx("admin.ledger.money.correct.paymentReasonPlaceholder")}
      />
      <PreviewLine>
        {!fields.changed ? (
          <span className="text-muted-foreground">
            {tx("admin.ledger.money.correct.nothingYetPayment")}
          </span>
        ) : differencePaise === 0 ? (
          tx("admin.ledger.money.correct.historyOnly", { balance: balanceText(paper.balance) })
        ) : (
          <>
            {tx("admin.ledger.money.correct.preview", {
              type: tx("admin.ledger.rowTypes.payment_adjusted"),
              side: tx(
                differencePaise < 0 ? "admin.ledger.columns.debit" : "admin.ledger.columns.credit",
              ),
              amount: formatPaise(Math.abs(differencePaise)),
              number: payment.number,
              balance: balanceText(balanceAfter),
            })}
            {amountPaise === 0 && <> {tx("admin.ledger.money.correct.neutralised")}</>}
          </>
        )}
      </PreviewLine>
      <CorrectFeedback fields={fields} onReload={onReload} />
      <CorrectFooter
        disabled={!canSubmit}
        busy={isCorrectingPayment}
        onSubmit={handleSubmit}
        onClose={onClose}
      />
    </div>
  );
}

export function CorrectRefundForm({
  paper,
  onSaved,
  onClose,
  onReload,
}: {
  paper: RefundPaper;
  onSaved: () => void;
  onClose: () => void;
  onReload: () => void;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const balanceText = useBalanceText();
  const { refund } = paper;
  const fields = useCorrectFields({
    amountPaise: refund.amountPaise,
    mode: refund.mode,
    reference: refund.reference,
    latestEventId: paper.latestEventId,
  });
  const { correctRefundAsync, isCorrectingRefund } = useMoneyPaper();
  const handleError = useHandleCorrectError(fields);
  const { differencePaise, amountPaise } = fields;
  const advancePaise = paper.balance.state === "advance" ? paper.balance.amountPaise : 0;
  const over = differencePaise > advancePaise;
  const balanceAfter = toBalance(paper.balance.balancePaise + differencePaise);
  const amountErrorText = over
    ? tx("admin.ledger.money.correct.raiseOver", {
        increase: formatPaise(differencePaise),
        advance: formatPaise(advancePaise),
      })
    : (() => {
        const key = amountErrorKey(fields.amount, true);
        return key ? tx(key) : null;
      })();
  const canSubmit = fields.changed && !over && fields.reason.trim() !== "" && !isCorrectingRefund;

  async function handleSubmit() {
    if (!canSubmit || amountPaise == null) return;
    fields.setRefusal(null);
    fields.setOutcomeUnknown(false);
    try {
      const result = await correctRefundAsync({
        refundId: refund.id,
        expectedLatestEventId: fields.baseline.latestEventId,
        amountPaise,
        mode: fields.mode,
        reference: fields.referenceAfter,
        reason: fields.reason.trim(),
      });
      const difference = result.data.differencePaise;
      toast.success(
        difference === 0
          ? tx("admin.ledger.money.correct.savedHistory", { number: result.data.number })
          : tx("admin.ledger.money.correct.savedAmount", {
              number: result.data.number,
              type: tx("admin.ledger.rowTypes.refund_adjusted"),
              side: tx(
                difference > 0 ? "admin.ledger.columns.debit" : "admin.ledger.columns.credit",
              ),
              amount: formatPaise(Math.abs(difference)),
            }),
      );
      onSaved();
    } catch (error) {
      handleError(error);
    }
  }

  return (
    <div className="grid gap-4">
      <ModeField
        id="correct-refund-mode"
        value={fields.mode}
        onChange={fields.setMode}
        disabled={isCorrectingRefund}
      />
      <AmountField
        id="correct-refund-amount"
        label={tx("admin.ledger.money.addRefund.amount")}
        value={fields.amount}
        onChange={fields.setAmount}
        disabled={isCorrectingRefund}
        error={amountErrorText}
        hint={tx("admin.ledger.money.correct.refundUpTo", {
          max: formatPaise(refund.amountPaise + advancePaise),
          amount: formatPaise(refund.amountPaise),
          advance: formatPaise(advancePaise),
        })}
      />
      <ReferenceField
        id="correct-refund-reference"
        value={fields.reference}
        onChange={fields.setReference}
        disabled={isCorrectingRefund}
      />
      <MoneyReasonField
        id="correct-refund-reason"
        value={fields.reason}
        onChange={fields.setReason}
        disabled={isCorrectingRefund}
        placeholder={tx("admin.ledger.money.correct.refundReasonPlaceholder")}
      />
      <PreviewLine>
        {!fields.changed ? (
          <span className="text-muted-foreground">
            {tx("admin.ledger.money.correct.nothingYet")}
          </span>
        ) : over ? (
          <span className="text-destructive">
            {tx("admin.ledger.money.correct.refusedPending")}
          </span>
        ) : differencePaise === 0 ? (
          tx("admin.ledger.money.correct.historyOnly", { balance: balanceText(paper.balance) })
        ) : (
          tx("admin.ledger.money.correct.preview", {
            type: tx("admin.ledger.rowTypes.refund_adjusted"),
            side: tx(
              differencePaise > 0 ? "admin.ledger.columns.debit" : "admin.ledger.columns.credit",
            ),
            amount: formatPaise(Math.abs(differencePaise)),
            number: refund.number,
            balance: balanceText(balanceAfter),
          })
        )}
      </PreviewLine>
      <CorrectFeedback fields={fields} onReload={onReload} />
      <CorrectFooter
        disabled={!canSubmit}
        busy={isCorrectingRefund}
        onSubmit={handleSubmit}
        onClose={onClose}
      />
    </div>
  );
}
