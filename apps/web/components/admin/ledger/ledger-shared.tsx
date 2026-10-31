"use client";

import { AlertCircleIcon, CircleHelpIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { BackHeader } from "~/components/admin/products/back-header";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { LedgerBalance, LedgerRowType, NoteKind } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

export const LEDGER_ROW_TYPES: LedgerRowType[] = [
  "opening_balance",
  "bill",
  "payment",
  "refund",
  "gst_credit_note",
  "commercial_credit_note",
  "debit_note",
];

export const NOTE_KINDS: NoteKind[] = ["gst_credit_note", "commercial_credit_note", "debit_note"];

export const MAX_REASON_LENGTH = 1000;

// The Ledger URL (Customer, filters, page) a paper's Back returns to.
export const LEDGER_RETURN_KEY = "motake.ledger.return";

export function ledgerReturnHref(customerId: string | undefined): string {
  const plain = customerId ? `/admin/ledger?customer=${customerId}` : "/admin/ledger";
  try {
    const saved = sessionStorage.getItem(LEDGER_RETURN_KEY);
    if (saved && customerId && saved.includes(`customer=${customerId}`)) return saved;
  } catch {
    // Storage off: the plain Ledger link.
  }
  return plain;
}

// Today in Asia/Kolkata as yyyy-mm-dd, the business date the server checks against.
export function businessToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** "Pending ₹1,234.00", "Advance ₹50.00" or "Settled". */
export function useBalanceText() {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  return useCallback(
    (balance: LedgerBalance) =>
      balance.state === "settled"
        ? tx("admin.ledger.balance.settled")
        : tx("admin.ledger.balance.chip", {
            state: tx(`admin.ledger.balance.${balance.state}`),
            amount: formatPaise(balance.amountPaise),
          }),
    [formatPaise, tx],
  );
}

export function RefusalAlert({ message, title }: { message: string; title?: string }) {
  const tx = useTranslate();
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title ?? tx("admin.ledger.notSaved")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function ReasonField({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const tx = useTranslate();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{tx("admin.ledger.reason.label")}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_REASON_LENGTH}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-xl bg-muted/40"
      />
    </div>
  );
}

/** The write may or may not have happened: check the Ledger before trying again. */
export function OutcomeUnknownAlert({ message }: { message: string }) {
  const tx = useTranslate();
  return (
    <Alert>
      <CircleHelpIcon />
      <AlertTitle>{tx("admin.ledger.outcomeUnknown.title")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Due chip tints for an open Pre-order (as on Orders: amber due, muted upcoming). */
export const DUE_CHIP = {
  overdue: "border-transparent bg-destructive/10 text-destructive",
  due: "border-transparent bg-amber-500/10 text-amber-700",
  upcoming: "border-transparent bg-muted text-muted-foreground",
} as const;

/**
 * A paper's page header: round Back to the saved Ledger URL (or `href`), and the shop name.
 * The saved Ledger URL is read after mount: it lives in this tab's session storage.
 */
export function LedgerBackHeader({
  customerId,
  shopName,
  href: fixedHref,
  actions,
}: {
  customerId?: string;
  shopName?: string;
  href?: string;
  actions?: ReactNode;
}) {
  const tx = useTranslate();
  const [href, setHref] = useState(
    customerId ? `/admin/ledger?customer=${customerId}` : "/admin/ledger",
  );
  useEffect(() => setHref(ledgerReturnHref(customerId)), [customerId]);
  return (
    <BackHeader
      href={fixedHref ?? href}
      title={shopName ?? tx("admin.ledger.title")}
      actions={actions}
    />
  );
}

/** A paper that did not load: muted text and an outline Try again. */
export function PaperLoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tx = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" className="rounded-full" onClick={onRetry}>
        {tx("common.actions.tryAgain")}
      </Button>
    </div>
  );
}
