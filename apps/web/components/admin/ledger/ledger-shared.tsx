"use client";

import { AlertCircleIcon } from "lucide-react";
import { useCallback } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { LedgerBalance, LedgerRowType, NoteKind } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

export const LEDGER_ROW_TYPES: LedgerRowType[] = [
  "opening_balance",
  "bill",
  "payment",
  "payment_adjusted",
  "refund",
  "refund_adjusted",
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
      />
    </div>
  );
}
