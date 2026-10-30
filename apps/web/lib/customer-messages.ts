// Spec J: what a WhatsApp message's status means on screen. Derived only from the fields
// `customerMessages.listForDocument` returns; the server decides every refusal, these only grey out.

type NotificationKind =
  | "bill"
  | "receipt"
  | "credit_note"
  | "debit_note"
  | "account_update"
  | "cancellation";

type FailureCategory =
  | "invalid_recipient"
  | "window_closed"
  | "template_error"
  | "media_error"
  | "auth_error"
  | "payment_error"
  | "opted_out_or_blocked"
  | "rate_limited"
  | "provider_unavailable"
  | "ambiguous"
  | "unknown";

export interface MessageStatusFields {
  kind: NotificationKind;
  businessRef: string;
  status: "pending" | "delivered" | "read" | "failed" | "skipped";
  skipReason: string | null;
  attemptCount: number;
  failureCategory: FailureCategory | null;
  latestBill: boolean;
}

export type DisplayStatus =
  | "waiting"
  | "sent"
  | "held"
  | "delivered"
  | "read"
  | "failed"
  | "superseded"
  | "skipped";

// The nine templates. `kind` + the ref's document give the template (an `account_update` on a
// Payment is Payment corrected, on a Refund the Refund message, on a Note the Note update).
export type MessageTemplate =
  | "bill"
  | "receipt"
  | "bill_corrected"
  | "payment_corrected"
  | "refund"
  | "cancellation"
  | "gst_credit_note"
  | "gst_debit_note"
  | "note_update";

const TEMPLATE_HAS_PDF: Record<MessageTemplate, boolean> = {
  bill: true,
  receipt: true,
  bill_corrected: false,
  payment_corrected: false,
  refund: false,
  cancellation: false,
  gst_credit_note: true,
  gst_debit_note: true,
  note_update: false,
};

// Paused until the WhatsApp token or payment is fixed; goes out by itself after.
const HELD_CATEGORIES: FailureCategory[] = ["auth_error", "payment_error"];

export function displayStatus(
  row: Pick<MessageStatusFields, "status" | "skipReason" | "attemptCount" | "failureCategory">,
): DisplayStatus {
  if (row.status === "skipped")
    return row.skipReason?.startsWith("superseded:") ? "superseded" : "skipped";
  if (row.status === "pending") {
    if (row.failureCategory && HELD_CATEGORIES.includes(row.failureCategory)) return "held";
    return row.attemptCount > 0 ? "sent" : "waiting";
  }
  return row.status;
}

// The status a paper's summary shows: the one that most needs a look.
const WORST_FIRST: DisplayStatus[] = [
  "failed",
  "held",
  "skipped",
  "waiting",
  "sent",
  "delivered",
  "read",
  "superseded",
];

export function worstStatus(rows: MessageStatusFields[]): DisplayStatus | null {
  const present = new Set(rows.map(displayStatus));
  return WORST_FIRST.find((status) => present.has(status)) ?? null;
}

export function needsFastRefresh(rows: MessageStatusFields[], live: boolean): boolean {
  if (live && rows.length === 0) return true;
  return rows.some((row) => {
    const shown = displayStatus(row);
    return shown === "waiting" || shown === "sent";
  });
}

export function templateOf(
  row: Pick<MessageStatusFields, "kind" | "businessRef">,
): MessageTemplate {
  const document = row.businessRef.split("/")[0];
  switch (row.kind) {
    case "bill":
      return "bill";
    case "receipt":
      return "receipt";
    case "credit_note":
      return "gst_credit_note";
    case "debit_note":
      return "gst_debit_note";
    case "cancellation":
      return "cancellation";
    case "account_update":
      if (document === "payment") return "payment_corrected";
      if (document === "refund") return "refund";
      if (document === "note") return "note_update";
      return "bill_corrected";
  }
}

export function hasPdf(row: Pick<MessageStatusFields, "kind" | "businessRef">): boolean {
  return TEMPLATE_HAS_PDF[templateOf(row)];
}

// "bill/<id>/v2" → 2, for "Bill v2".
export function billVersionOf(row: Pick<MessageStatusFields, "kind" | "businessRef">) {
  if (row.kind !== "bill") return null;
  const match = /\/v(\d+)$/.exec(row.businessRef);
  return match ? Number(match[1]) : null;
}

// Locale key (under `whatsapp.reason`) for the plain words of a failure or skip, if any.
export function reasonKey(row: MessageStatusFields): string | null {
  const shown = displayStatus(row);
  if (shown === "superseded")
    return row.skipReason === "superseded: cancelled" ? "supersededCancelled" : "supersededNewer";
  if (shown === "skipped") {
    if (row.skipReason === "missing phone") return "missingPhone";
    return "invalidPhone";
  }
  if (row.failureCategory && (shown === "failed" || shown === "held"))
    return `failure.${row.failureCategory}`;
  return null;
}

export interface ResendContext {
  customerActive: boolean;
  // Bill paper: a cancelled Bill's Bill messages are never sent again.
  billCancelled?: boolean;
}

// Locale key (under `whatsapp.block`) for why Resend is off, or null when the server may take it.
export function resendBlockKey(row: MessageStatusFields, context: ResendContext): string | null {
  if (!context.customerActive) return "inactive";
  const shown = displayStatus(row);
  if (shown === "waiting" || shown === "sent") return "pending";
  if (shown === "held") return "held";
  if (row.kind === "bill" && (context.billCancelled || row.skipReason === "superseded: cancelled"))
    return "billCancelled";
  if (row.kind === "bill" && (!row.latestBill || shown === "superseded")) return "olderBill";
  return null;
}

// Locale key (under `whatsapp.block`) for why Send latest Bill is off.
export function sendLatestBlockKey(bill: {
  cancelled: boolean;
  irnPending: boolean;
  customerActive: boolean;
}): string | null {
  if (bill.cancelled) return "latestCancelled";
  if (bill.irnPending) return "latestIrnPending";
  if (!bill.customerActive) return "inactive";
  return null;
}
