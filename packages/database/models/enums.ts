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

export const orderTypeEnum = pgEnum("order_type", ["book_now", "pre_order"]);

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

export const paymentEventKindEnum = pgEnum("payment_event_kind", ["posted", "adjusted"]);

export const refundEventKindEnum = pgEnum("refund_event_kind", ["posted", "adjusted"]);

export const documentKindEnum = pgEnum("document_kind", [
  "bill",
  "credit_note",
  "debit_note",
  "payment",
  "refund",
]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "bill",
  "receipt",
  "credit_note",
  "debit_note",
  "account_update",
  "cancellation",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "delivered",
  "read",
  "failed",
  "skipped",
]);

export const notificationProviderEnum = pgEnum("notification_provider", ["whatsapp", "sms"]);

export const messageLanguageEnum = pgEnum("message_language", ["mr", "en"]);

export const templateDocumentTypeEnum = pgEnum("template_document_type", ["none", "image", "pdf"]);

export const attachmentTypeEnum = pgEnum("attachment_type", ["image", "pdf"]);

export const notificationAttemptStatusEnum = pgEnum("notification_attempt_status", [
  "sent",
  "failed",
]);

export const auditEntityTypeEnum = pgEnum("audit_entity_type", [
  "profile",
  "salesman",
  "product",
  "product_variety",
  "variety_tax_period",
  "route",
  "route_price",
  "customer",
  "gatepass",
  "order",
  "bill",
  "note",
  "payment",
  "refund",
  "seller_settings",
  "document_number_series",
  "gst_credit_note_deadline",
  "gstr1_filing",
  "whatsapp_token",
  "city",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "created",
  "updated",
  "activated",
  "deactivated",
  "deleted",
  "allotted",
  "handover_submitted",
  "closed",
  "placed",
  "fulfilled",
  "cancelled",
  "corrected",
  "irn_recorded",
  "portal_cancelled",
  "note_raised",
  "opening_set",
  "filed",
  "moved_route",
  "token_updated",
]);
