import { TRPCError } from "@trpc/server";

export const unauthorized = (message = "Not authenticated") =>
  new TRPCError({ code: "UNAUTHORIZED", message });

export const forbidden = (message = "You don't have access to this resource") =>
  new TRPCError({ code: "FORBIDDEN", message });

export const notFound = (message = "Resource not found") =>
  new TRPCError({ code: "NOT_FOUND", message });

export const badRequest = (message = "Bad request") =>
  new TRPCError({ code: "BAD_REQUEST", message });

export const conflict = (message = "Resource conflict") =>
  new TRPCError({ code: "CONFLICT", message });

export const internalError = (message = "Internal server error") =>
  new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });

export const notImplemented = (message = "Not implemented") =>
  new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Not implemented: ${message}` });

export const tooManyRequests = (
  retryAfterMs?: number,
  message = "Too many requests, please slow down",
) =>
  new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message,
    cause:
      retryAfterMs !== undefined ? Object.assign(new Error(message), { retryAfterMs }) : undefined,
  });

export interface UncoveredVariety {
  id: string;
  name: string;
  sku: string;
}

// Every Variety in the request that has no tax period covering `day`, so the caller can refuse the
// whole basket in one go.
export const noCoveringTaxPeriod = (uncoveredVarieties: UncoveredVariety[], day: string) => {
  const names = uncoveredVarieties.map((variety) => variety.name).join(", ");
  const message = `No GST for ${day}, cannot be sold: ${names}`;
  return new TRPCError({
    code: "BAD_REQUEST",
    message,
    cause: Object.assign(new Error(message), { uncoveredVarieties, day }),
  });
};

// A refused call: nothing is written and the app branches on a machine reason. `reason` and
// `details` travel in the cause so the router error formatter hands them to the app as
// `data.refusal`. Each spec keeps its own reason list and HTTP codes on top of `refused`.
export interface Refusal<Reason extends string = string> {
  reason: Reason;
  details: Record<string, unknown> | null;
}

export const refused = <Reason extends string>(
  code: TRPCError["code"],
  reason: Reason,
  message: string,
  details: Record<string, unknown> | null = null,
) => {
  const refusal: Refusal<Reason> = { reason, details };
  return new TRPCError({ code, message, cause: Object.assign(new Error(message), { refusal }) });
};

// An unknown thrown value as log text.
export function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The refusal carried by an error, or null for any other error.
export function refusalOf(error: unknown): Refusal | null {
  const cause = error instanceof TRPCError ? error.cause : undefined;
  const refusal = (cause as { refusal?: Refusal } | undefined)?.refusal;
  return refusal ?? null;
}

// Why a notification instruction was refused, for callers that branch on it (Spec J).
export type NotificationRefusalReason =
  | "provider_not_supported"
  | "template_not_found"
  | "template_not_verified"
  | "template_values_mismatch"
  | "attachment_mismatch"
  | "template_superseded"
  | "token_not_working";

const notificationRefusalCodes: Record<NotificationRefusalReason, TRPCError["code"]> = {
  provider_not_supported: "BAD_REQUEST",
  template_not_found: "BAD_REQUEST",
  template_not_verified: "BAD_REQUEST",
  template_values_mismatch: "BAD_REQUEST",
  attachment_mismatch: "BAD_REQUEST",
  template_superseded: "BAD_REQUEST",
  token_not_working: "CONFLICT",
};

// A refused notification instruction (Spec K); the reason reaches the main API as
// `data.refusal.reason`.
export const notificationRefused = (
  reason: NotificationRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(notificationRefusalCodes[reason], reason, message, details);

// Why an Admin WhatsApp access token call was refused (Spec J-0). The message is for the Admin and
// never carries the token.
export type WhatsAppTokenRefusalReason =
  | "token_invalid"
  | "token_check_unavailable"
  | "token_not_working"
  | "notification_unavailable";

const whatsAppTokenRefusalCodes: Record<WhatsAppTokenRefusalReason, TRPCError["code"]> = {
  token_invalid: "BAD_REQUEST",
  token_check_unavailable: "SERVICE_UNAVAILABLE",
  token_not_working: "CONFLICT",
  notification_unavailable: "SERVICE_UNAVAILABLE",
};

export const whatsAppTokenRefused = (
  reason: WhatsAppTokenRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(whatsAppTokenRefusalCodes[reason], reason, message, details);

// Why a Document call was refused, for callers that branch on it (Specs G, I, J).
export type DocumentRefusalReason = "not_found" | "not_posted_event" | "nothing_kept" | "forbidden";

const documentRefusalCodes: Record<DocumentRefusalReason, TRPCError["code"]> = {
  not_found: "NOT_FOUND",
  not_posted_event: "BAD_REQUEST",
  nothing_kept: "BAD_REQUEST",
  forbidden: "FORBIDDEN",
};

// The message is for the Admin; the reason reaches the app as `data.refusal.reason`.
export const documentRefused = (
  reason: DocumentRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(documentRefusalCodes[reason], reason, message, details);

// Checkout refusals (Spec F): the whole call is refused and nothing is written.
export type CheckoutRefusalReason =
  | "no_active_gatepass"
  | "customer_not_on_route"
  | "customer_inactive"
  | "empty_basket"
  | "bad_lines"
  | "short_stock"
  | "price_field_refused"
  | "scheduled_date_in_past"
  | "fulfil_too_early"
  | "already_fulfilled"
  | "pre_order_cancelled"
  | "wrong_route"
  | "not_a_pre_order"
  | "overpay_choice_required"
  | "return_change_cash_only"
  | "field_payment_kept_zero"
  | "bill_total_zero"
  | "seller_master_missing"
  | "balance_changed"
  | "idempotency_key_reused";

export type CheckoutRefusal = Refusal<CheckoutRefusalReason>;

const checkoutRefusalCodes: Record<CheckoutRefusalReason, TRPCError["code"]> = {
  no_active_gatepass: "BAD_REQUEST",
  customer_not_on_route: "FORBIDDEN",
  customer_inactive: "BAD_REQUEST",
  empty_basket: "BAD_REQUEST",
  bad_lines: "BAD_REQUEST",
  short_stock: "CONFLICT",
  price_field_refused: "BAD_REQUEST",
  scheduled_date_in_past: "BAD_REQUEST",
  fulfil_too_early: "CONFLICT",
  already_fulfilled: "CONFLICT",
  pre_order_cancelled: "CONFLICT",
  wrong_route: "FORBIDDEN",
  not_a_pre_order: "BAD_REQUEST",
  overpay_choice_required: "BAD_REQUEST",
  return_change_cash_only: "BAD_REQUEST",
  field_payment_kept_zero: "BAD_REQUEST",
  bill_total_zero: "BAD_REQUEST",
  seller_master_missing: "CONFLICT",
  balance_changed: "CONFLICT",
  idempotency_key_reused: "CONFLICT",
};

export const checkoutRefusal = (
  reason: CheckoutRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(checkoutRefusalCodes[reason], reason, message, details);

// The checkout refusal carried by an error, or null for any other error.
export const checkoutRefusalOf = (error: unknown): CheckoutRefusal | null =>
  refusalOf(error) as CheckoutRefusal | null;

// Admin Ledger, Bill paper (Spec G) and Payment / Refund paper (Spec H) refusals: the whole call is
// refused and nothing is written. A deactivated Customer is refused as checkout's customer_inactive;
// a ₹0 Raise Bill as bill_total_zero. A stale Payment or Refund Correct is stale_version.
export type LedgerRefusalReason =
  | "empty_basket"
  | "bad_lines"
  | "bill_cancelled"
  | "bill_locked"
  | "stale_version"
  | "nothing_changed"
  | "all_lines_zero"
  | "unknown_line"
  | "below_credited_qty"
  | "note_amount_zero"
  | "nothing_to_cancel"
  | "not_a_pre_order"
  | "already_fulfilled"
  | "already_cancelled"
  | "no_lines"
  | "credit_qty_above_remaining"
  | "gst_credit_note_deadline_passed"
  | "return_date_on_debit_note"
  | "opening_balance_exists"
  | "opening_date_in_future"
  | "idempotency_key_reused"
  | "not_in_advance"
  | "refund_above_advance";

export type LedgerRefusal = Refusal<LedgerRefusalReason>;

const ledgerRefusalCodes: Record<LedgerRefusalReason, TRPCError["code"]> = {
  empty_basket: "BAD_REQUEST",
  bad_lines: "BAD_REQUEST",
  bill_cancelled: "CONFLICT",
  bill_locked: "CONFLICT",
  stale_version: "CONFLICT",
  nothing_changed: "BAD_REQUEST",
  all_lines_zero: "BAD_REQUEST",
  unknown_line: "BAD_REQUEST",
  below_credited_qty: "BAD_REQUEST",
  note_amount_zero: "BAD_REQUEST",
  nothing_to_cancel: "CONFLICT",
  not_a_pre_order: "BAD_REQUEST",
  already_fulfilled: "CONFLICT",
  already_cancelled: "CONFLICT",
  no_lines: "BAD_REQUEST",
  credit_qty_above_remaining: "BAD_REQUEST",
  gst_credit_note_deadline_passed: "BAD_REQUEST",
  return_date_on_debit_note: "BAD_REQUEST",
  opening_balance_exists: "CONFLICT",
  opening_date_in_future: "BAD_REQUEST",
  idempotency_key_reused: "CONFLICT",
  not_in_advance: "CONFLICT",
  refund_above_advance: "CONFLICT",
};

export const ledgerRefusal = (
  reason: LedgerRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(ledgerRefusalCodes[reason], reason, message, details);

// Why a WhatsApp Resend or Send latest Bill was refused (Spec J). The message is for the staff
// member; the reason reaches the app as `data.refusal.reason`.
export type CustomerMessageRefusalReason =
  | "no_active_gatepass"
  | "customer_not_on_route"
  | "message_pending"
  | "not_latest_bill"
  | "bill_cancelled"
  | "phone_unusable"
  | "template_superseded"
  | "notification_unavailable";

const customerMessageRefusalCodes: Record<CustomerMessageRefusalReason, TRPCError["code"]> = {
  no_active_gatepass: "FORBIDDEN",
  customer_not_on_route: "FORBIDDEN",
  message_pending: "CONFLICT",
  not_latest_bill: "CONFLICT",
  bill_cancelled: "CONFLICT",
  phone_unusable: "BAD_REQUEST",
  template_superseded: "CONFLICT",
  notification_unavailable: "SERVICE_UNAVAILABLE",
};

export const customerMessageRefused = (
  reason: CustomerMessageRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(customerMessageRefusalCodes[reason], reason, message, details);

// Business rules on Admin and salesman screens outside checkout and the Ledger. The message stays
// for logs and API callers; the app shows its own words for `data.refusal.reason`, filled from
// `details`, so a screen never shows server text.
export type ScreenRefusalReason =
  | "account_deactivated"
  | "variety_name_taken"
  | "gst_exempt_rate_not_zero"
  | "gst_rate_required"
  | "gst_start_outside_window"
  | "route_required"
  | "route_deleted"
  | "route_name_taken"
  | "route_has_open_work"
  | "photo_upload_invalid"
  | "customer_has_open_pre_orders"
  | "customer_already_on_route"
  | "no_active_gatepass"
  | "email_taken"
  | "password_too_weak"
  | "email_invalid"
  | "gatepass_not_awaiting_verification"
  | "duplicate_variety_in_allotment"
  | "salesman_has_gatepass"
  | "route_price_missing"
  | "gatepass_not_active"
  | "returned_qty_out_of_range"
  | "short_reason_required"
  | "stock_changed"
  | "checkout_already_placed"
  | "number_series_exhausted"
  | "number_series_missing"
  | "refund_above_advance"
  | "already_posted"
  | "amount_not_positive"
  | "opening_balance_exists"
  | "nothing_changed"
  | "gstr1_already_filed"
  | "filing_month_not_ended"
  | "filing_date_before_month_end"
  | "filing_date_after_today"
  | "message_pending"
  | "phone_unusable"
  | "gstin_state_mismatch"
  | "pan_gstin_mismatch"
  | "seller_master_exists"
  | "seller_master_missing"
  | "financial_year_ended"
  | "financial_year_too_far"
  | "prefix_too_long"
  | "prefix_frozen"
  | "prefix_taken"
  | "deadline_too_early"
  | "deadline_changed";

// Each reason keeps the HTTP code its error had before it carried a reason.
const screenRefusalCodes: Record<ScreenRefusalReason, TRPCError["code"]> = {
  account_deactivated: "FORBIDDEN",
  variety_name_taken: "CONFLICT",
  gst_exempt_rate_not_zero: "BAD_REQUEST",
  gst_rate_required: "BAD_REQUEST",
  gst_start_outside_window: "BAD_REQUEST",
  route_required: "BAD_REQUEST",
  route_deleted: "BAD_REQUEST",
  route_name_taken: "CONFLICT",
  route_has_open_work: "CONFLICT",
  photo_upload_invalid: "FORBIDDEN",
  customer_has_open_pre_orders: "CONFLICT",
  customer_already_on_route: "BAD_REQUEST",
  no_active_gatepass: "BAD_REQUEST",
  email_taken: "BAD_REQUEST",
  password_too_weak: "BAD_REQUEST",
  email_invalid: "BAD_REQUEST",
  gatepass_not_awaiting_verification: "CONFLICT",
  duplicate_variety_in_allotment: "BAD_REQUEST",
  salesman_has_gatepass: "CONFLICT",
  route_price_missing: "BAD_REQUEST",
  gatepass_not_active: "CONFLICT",
  returned_qty_out_of_range: "BAD_REQUEST",
  short_reason_required: "BAD_REQUEST",
  stock_changed: "INTERNAL_SERVER_ERROR",
  checkout_already_placed: "CONFLICT",
  number_series_exhausted: "CONFLICT",
  number_series_missing: "INTERNAL_SERVER_ERROR",
  refund_above_advance: "CONFLICT",
  already_posted: "CONFLICT",
  amount_not_positive: "BAD_REQUEST",
  opening_balance_exists: "CONFLICT",
  nothing_changed: "BAD_REQUEST",
  gstr1_already_filed: "CONFLICT",
  filing_month_not_ended: "BAD_REQUEST",
  filing_date_before_month_end: "BAD_REQUEST",
  filing_date_after_today: "BAD_REQUEST",
  message_pending: "CONFLICT",
  phone_unusable: "BAD_REQUEST",
  gstin_state_mismatch: "BAD_REQUEST",
  pan_gstin_mismatch: "BAD_REQUEST",
  seller_master_exists: "CONFLICT",
  seller_master_missing: "NOT_FOUND",
  financial_year_ended: "BAD_REQUEST",
  financial_year_too_far: "BAD_REQUEST",
  prefix_too_long: "BAD_REQUEST",
  prefix_frozen: "CONFLICT",
  prefix_taken: "CONFLICT",
  deadline_too_early: "BAD_REQUEST",
  deadline_changed: "CONFLICT",
};

export const screenRefusal = (
  reason: ScreenRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(screenRefusalCodes[reason], reason, message, details);
