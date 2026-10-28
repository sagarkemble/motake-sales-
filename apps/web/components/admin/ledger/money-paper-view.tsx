"use client";

import { InfoIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { LedgerSummary, OpeningPaper, PaymentPaper, RefundPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

import { LedgerBackHeader, useBalanceText } from "./ledger-shared";
import { CorrectPaymentForm, CorrectRefundForm } from "./money-paper-forms";
import {
  Fact,
  HistoryList,
  InactiveNotice,
  PaymentFacts,
  RefundFacts,
  paymentHistory,
  refundHistory,
} from "./money-paper-parts";

export type MoneyPaperModel =
  | { kind: "payment"; paper: PaymentPaper }
  | { kind: "refund"; paper: RefundPaper };

function numberOf(model: MoneyPaperModel) {
  return model.kind === "payment" ? model.paper.payment.number : model.paper.refund.number;
}

function PaperHeading({ model }: { model: MoneyPaperModel }) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const amount =
    model.kind === "payment"
      ? tx("admin.ledger.money.paper.kept", { amount: formatPaise(model.paper.payment.keptPaise) })
      : tx("admin.ledger.money.paper.paidBack", {
          amount: formatPaise(model.paper.refund.amountPaise),
        });
  const mode = model.kind === "payment" ? model.paper.payment.mode : model.paper.refund.mode;
  const corrections = model.paper.events.length - 1;
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {tx(`admin.ledger.money.paper.${model.kind}`)}
        </p>
        <h2 className="font-mono text-base font-semibold break-all">{numberOf(model)}</h2>
        <p className="text-sm">
          <span className="font-medium tabular-nums">{amount}</span>
          <span className="text-muted-foreground"> · {tx(`admin.ledger.money.modes.${mode}`)}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {model.kind === "payment" && (
          <Badge variant="secondary">
            {model.paper.payment.source === "office"
              ? tx("admin.ledger.money.paper.office")
              : tx("admin.ledger.money.paper.salesman")}
          </Badge>
        )}
        {corrections > 0 && (
          <Badge variant="outline">
            {tx("admin.ledger.money.paper.corrected", { count: corrections })}
          </Badge>
        )}
        {model.paper.customer.status === "inactive" && (
          <Badge variant="outline">{tx("admin.ledger.paper.inactive")}</Badge>
        )}
      </div>
    </div>
  );
}

/**
 * The Payment or Refund paper: one card with the current state, its history, and Correct in a
 * dialog. Correct is off for a deactivated Customer; the paper stays readable.
 */
export function MoneyPaperView({
  model,
  onReload,
}: {
  model: MoneyPaperModel;
  onReload: () => Promise<unknown>;
}) {
  const tx = useTranslate();
  const balanceText = useBalanceText();
  const [open, setOpen] = useState(false);
  // Bumped on Reload, so the open Correct form starts again from the reloaded paper.
  const [formKey, setFormKey] = useState(0);
  const { paper } = model;
  const canCorrect = paper.actions.canCorrect;

  async function reload() {
    await onReload();
    setFormKey((key) => key + 1);
  }

  const formProps = {
    onSaved: () => setOpen(false),
    onClose: () => setOpen(false),
    onReload: () => void reload(),
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LedgerBackHeader customerId={paper.customer.id} shopName={paper.customer.shopName} />
        <span className="text-xs text-muted-foreground">
          {tx("admin.ledger.paper.balanceNow", { balance: balanceText(paper.balance) })}
        </span>
      </div>
      {!canCorrect && <InactiveNotice />}
      <article className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <PaperHeading model={model} />
          <Button
            className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto"
            disabled={!canCorrect}
            title={canCorrect ? undefined : tx("admin.ledger.paper.off.inactive")}
            onClick={() => setOpen(true)}
          >
            {tx("admin.ledger.money.correct.button")}
          </Button>
        </div>
        {model.kind === "payment" ? (
          <PaymentFacts paper={model.paper} />
        ) : (
          <RefundFacts paper={model.paper} />
        )}
        <div className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-medium">{tx("admin.ledger.money.history.title")}</h2>
          {model.kind === "payment" ? (
            <HistoryList
              events={paymentHistory(model.paper)}
              afterLabel={tx("admin.ledger.money.history.keptAfter")}
            />
          ) : (
            <HistoryList
              events={refundHistory(model.paper)}
              afterLabel={tx("admin.ledger.money.history.amountAfter")}
            />
          )}
        </div>
      </article>
      <Dialog open={open && canCorrect} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 rounded-2xl p-0 sm:max-w-lg">
          {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
          <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
            {open && (
              <div className="flex flex-col gap-4 p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle>
                    {tx("admin.ledger.money.correct.title", { number: numberOf(model) })}
                  </DialogTitle>
                  <DialogDescription>
                    {tx("admin.ledger.money.correct.description")}
                  </DialogDescription>
                </DialogHeader>
                {model.kind === "payment" ? (
                  <CorrectPaymentForm key={formKey} paper={model.paper} {...formProps} />
                ) : (
                  <CorrectRefundForm key={formKey} paper={model.paper} {...formProps} />
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The Opening paper: view only, no number and no Correct. */
export function OpeningPaperView({
  opening,
  summary,
}: {
  opening: OpeningPaper;
  summary: LedgerSummary;
}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { customer } = summary;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-4">
      <LedgerBackHeader customerId={customer.id} shopName={customer.shopName} />
      {opening == null ? (
        <Alert>
          <InfoIcon />
          <AlertTitle>{tx("admin.ledger.money.opening.noneTitle")}</AlertTitle>
          <AlertDescription>{tx("admin.ledger.money.opening.noneBody")}</AlertDescription>
        </Alert>
      ) : (
        <article className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{tx("admin.ledger.money.opening.title")}</h2>
              <p className="text-xs text-muted-foreground">
                {tx("admin.ledger.money.opening.noNumber")}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                opening.side === "pending"
                  ? "border-transparent bg-amber-500/10 text-amber-700"
                  : "border-transparent bg-brand/10 text-brand"
              }
            >
              {opening.side === "pending"
                ? tx("admin.ledger.money.opening.pendingDebit")
                : tx("admin.ledger.money.opening.advanceCredit")}
            </Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label={tx("admin.ledger.money.opening.amount")}>
              <span className="font-semibold tabular-nums">{formatPaise(opening.amountPaise)}</span>
            </Fact>
            <Fact label={tx("admin.ledger.money.opening.date")}>
              {formatDate(opening.date, "d MMM yyyy")}
            </Fact>
            <Fact label={tx("admin.ledger.money.opening.setBy")}>{opening.actorName ?? "—"}</Fact>
            <Fact label={tx("admin.ledger.money.opening.customer")}>{customer.shopName}</Fact>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">
                {tx("admin.ledger.money.opening.reason")}
              </dt>
              <dd className="text-sm break-words">{opening.reason ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <LockIcon className="mt-0.5 size-3.5 shrink-0" />
            {tx("admin.ledger.money.opening.locked")}
          </p>
        </article>
      )}
    </div>
  );
}
