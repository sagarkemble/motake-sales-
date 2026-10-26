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

// The refusal carried by an error, or null for any other error.
export function refusalOf(error: unknown): Refusal | null {
  const cause = error instanceof TRPCError ? error.cause : undefined;
  const refusal = (cause as { refusal?: Refusal } | undefined)?.refusal;
  return refusal ?? null;
}

// Why a Document call was refused, for callers that branch on it (Specs G, I, J).
export type DocumentRefusalReason =
  | "irn_missing"
  | "irn_not_recorded"
  | "irn_not_pending"
  | "superseded_version"
  | "not_found"
  | "not_posted_event"
  | "nothing_kept"
  | "bad_image"
  | "forbidden";

const documentRefusalCodes: Record<DocumentRefusalReason, TRPCError["code"]> = {
  irn_missing: "BAD_REQUEST",
  irn_not_recorded: "BAD_REQUEST",
  irn_not_pending: "BAD_REQUEST",
  superseded_version: "BAD_REQUEST",
  not_found: "NOT_FOUND",
  not_posted_event: "BAD_REQUEST",
  nothing_kept: "BAD_REQUEST",
  bad_image: "BAD_REQUEST",
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
  | "scheduled_date_not_after_today"
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
  scheduled_date_not_after_today: "BAD_REQUEST",
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
