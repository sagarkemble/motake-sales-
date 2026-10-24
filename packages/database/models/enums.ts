import { pgEnum } from "drizzle-orm/pg-core";

export const appRoleEnum = pgEnum("app_role", ["admin", "salesman"]);

export const entityStatusEnum = pgEnum("entity_status", ["active", "inactive"]);

export const gatepassStatusEnum = pgEnum("gatepass_status", [
  "not_issued",
  "active",
  "pending_verification",
  "closed",
]);

export const gatepassShortReasonEnum = pgEnum("gatepass_short_reason", [
  "damaged",
  "expired",
  "lost",
  "leaked",
  "other",
]);

// `office_bill` is the Admin Raise Bill from the Ledger: Route prices, no GatePass, no salesman.
export const orderTypeEnum = pgEnum("order_type", ["book_now", "pre_order", "office_bill"]);

export const orderStatusEnum = pgEnum("order_status", [
  "confirmed",
  "scheduled",
  "due",
  "fulfilled",
  "cancelled",
]);

export const legalTypeEnum = pgEnum("legal_type", ["tax_invoice", "bill_of_supply"]);

export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", [
  "opening_balance",
  "bill",
  "payment",
  "credit_note",
  "debit_note",
  "payment_adjusted",
  "refund",
  "refund_adjusted",
]);

export const ledgerSideEnum = pgEnum("ledger_side", ["debit", "credit"]);

export const noteKindEnum = pgEnum("note_kind", [
  "gst_credit_note",
  "commercial_credit_note",
  "debit_note",
]);

export const paymentModeEnum = pgEnum("payment_mode", ["cash", "bank", "upi"]);

export const moneyEventTypeEnum = pgEnum("money_event_type", ["posted", "adjusted"]);

// One number series per document type per financial year: MB / MC / MD / MP / MR.
export const documentSeriesEnum = pgEnum("document_series", [
  "bill",
  "credit_note",
  "debit_note",
  "payment",
  "refund",
]);

export const notificationKindEnum = pgEnum("notification_kind", ["text", "template", "document"]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "delivered",
  "read",
  "failed",
  "skipped",
]);
