import { TRPCClientError } from "@repo/trpc/client";

// Mirrors CheckoutRefusalReason in packages/services/errors: a refused checkout writes nothing
// and the reason travels as error.data.refusal.reason.
export const CHECKOUT_REFUSAL_REASONS = [
  "no_active_gatepass",
  "customer_not_on_route",
  "customer_inactive",
  "empty_basket",
  "bad_lines",
  "short_stock",
  "price_field_refused",
  "scheduled_date_in_past",
  "fulfil_too_early",
  "already_fulfilled",
  "pre_order_cancelled",
  "wrong_route",
  "not_a_pre_order",
  "overpay_choice_required",
  "return_change_cash_only",
  "field_payment_kept_zero",
  "bill_total_zero",
  "seller_master_missing",
  "balance_changed",
  "idempotency_key_reused",
] as const;

export type CheckoutRefusalReason = (typeof CHECKOUT_REFUSAL_REASONS)[number];

export interface CheckoutRefusal {
  reason: CheckoutRefusalReason;
  details: Record<string, unknown>;
}

// The checkout refusal an error carries, or null for any other error.
export function checkoutRefusalOf(error: unknown): CheckoutRefusal | null {
  if (!(error instanceof TRPCClientError)) return null;
  const refusal = (error.data as { refusal?: { reason?: string; details?: unknown } } | undefined)
    ?.refusal;
  const reason = CHECKOUT_REFUSAL_REASONS.find((known) => known === refusal?.reason);
  if (!reason) return null;
  const details =
    refusal?.details && typeof refusal.details === "object"
      ? (refusal.details as Record<string, unknown>)
      : {};
  return { reason, details };
}

const numberDetail = (details: Record<string, unknown>, key: string) =>
  typeof details[key] === "number" ? (details[key] as number) : null;

const stringDetail = (details: Record<string, unknown>, key: string) =>
  typeof details[key] === "string" ? (details[key] as string) : null;

export interface RefusalFormatters {
  shopName: string;
  formatPaise: (paise: number) => string;
  formatDate: (date: Date | string, pattern: string) => string;
}

// Values for the {placeholders} in checkout.refusal.<reason>.message.
export function refusalMessageValues(
  refusal: CheckoutRefusal,
  formatters: RefusalFormatters,
): Record<string, string | number> {
  const { details } = refusal;
  const lines = Array.isArray(details.lines) ? (details.lines as Record<string, unknown>[]) : [];
  const shortLines = lines
    .filter((line) => typeof line.needQty === "number")
    .map((line) => `${String(line.name ?? line.sku)}: ${line.needQty} / ${line.leftQty}`)
    .join("; ");
  const scheduledDate = stringDetail(details, "scheduledDate");
  const fulfilledAt = stringDetail(details, "fulfilledAt");
  const requiredPaise = numberDetail(details, "requiredPaise");
  const receivedPaise = numberDetail(details, "receivedPaise");
  return {
    shop: formatters.shopName,
    count: lines.length || 1,
    lines: shortLines || "—",
    date: scheduledDate ? formatters.formatDate(scheduledDate, "EEE, d MMM yyyy") : "—",
    by: stringDetail(details, "fulfilledByName") ?? "—",
    at: fulfilledAt ? formatters.formatDate(fulfilledAt, "d MMM yyyy, h:mm a") : "—",
    mb: stringDetail(details, "billNumber") ?? "—",
    extra:
      requiredPaise !== null && receivedPaise !== null
        ? formatters.formatPaise(Math.max(0, receivedPaise - requiredPaise))
        : "—",
  };
}

// Reasons whose copy offers no next step.
const REFUSALS_WITHOUT_ACTION = new Set<CheckoutRefusalReason>([
  "price_field_refused",
  "fulfil_too_early",
  "wrong_route",
  "not_a_pre_order",
  "return_change_cash_only",
  "seller_master_missing",
]);

export function refusalHasAction(reason: CheckoutRefusalReason) {
  return !REFUSALS_WITHOUT_ACTION.has(reason);
}

// A failure with no answer from the server (network drop, timeout, 5xx): the write may or may not
// have happened, so the next try must reuse the key and the salesman should check before redoing it.
export function isOutcomeUnknown(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return true;
  const httpStatus = (error.data as { httpStatus?: number } | undefined)?.httpStatus;
  return typeof httpStatus !== "number" || httpStatus >= 500;
}
