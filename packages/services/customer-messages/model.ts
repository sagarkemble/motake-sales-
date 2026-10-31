import { z } from "zod";

import type DocumentService from "../documents";
import type GstService from "../gst";
import type {
  EnqueueInput,
  EnqueueResult,
  FailureCategory,
  ListByBusinessRefsInput,
  NotificationKind,
  NotificationStatus,
  NotificationStatusView,
  NotificationTemplateView,
  ResendInput,
  ResendResult,
  ResolveTemplateInput,
  SuppressInput,
  SuppressResult,
} from "../notification/model";

export type MessageLanguage = "mr" | "en";

// --- Templates (v2): code constants that must match the hand-entered notification_templates rows
// (db-decisions/0014). Values are sent by these names, in this order.

export const customerMessageTemplates = {
  bill: {
    templateId: "motake_bill_v2",
    kind: "bill",
    pdf: true,
    values: ["customer", "route_name", "bill_number", "bill_date", "bill_amount", "balance_line"],
  },
  receipt: {
    templateId: "motake_receipt_v2",
    kind: "receipt",
    pdf: true,
    values: [
      "customer",
      "route_name",
      "receipt_number",
      "amount_received",
      "payment_mode",
      "balance_line",
    ],
  },
  billCorrected: {
    templateId: "motake_bill_corrected_v2",
    kind: "account_update",
    pdf: false,
    values: [
      "customer",
      "route_name",
      "bill_number",
      "reason",
      "balance_adjustment",
      "balance_line",
    ],
  },
  paymentCorrected: {
    templateId: "motake_payment_corrected_v2",
    kind: "account_update",
    pdf: false,
    values: [
      "customer",
      "route_name",
      "receipt_number",
      "previous_amount",
      "corrected_amount",
      "difference",
      "reason",
      "balance_line",
    ],
  },
  refund: {
    templateId: "motake_refund_v2",
    kind: "account_update",
    pdf: false,
    values: [
      "customer",
      "route_name",
      "refund_number",
      "refund_amount",
      "refund_mode",
      "balance_line",
    ],
  },
  cancellation: {
    templateId: "motake_cancellation_v2",
    kind: "cancellation",
    pdf: false,
    values: ["customer", "route_name", "bill_number", "reason", "amount_reversed", "balance_line"],
  },
  gstCreditNote: {
    templateId: "motake_gst_credit_note_v2",
    kind: "credit_note",
    pdf: true,
    values: [
      "customer",
      "route_name",
      "note_number",
      "bill_number",
      "reason",
      "credit_amount",
      "balance_line",
    ],
  },
  gstDebitNote: {
    templateId: "motake_gst_debit_note_v2",
    kind: "debit_note",
    pdf: true,
    values: [
      "customer",
      "route_name",
      "note_number",
      "bill_number",
      "reason",
      "additional_amount",
      "balance_line",
    ],
  },
  noteUpdate: {
    templateId: "motake_note_update_v2",
    kind: "account_update",
    pdf: false,
    values: [
      "customer",
      "route_name",
      "note_number",
      "bill_number",
      "status",
      "reason",
      "balance_adjustment",
      "balance_line",
    ],
  },
} as const satisfies Record<
  string,
  { templateId: string; kind: NotificationKind; pdf: boolean; values: readonly string[] }
>;

export type CustomerMessageTemplateName = keyof typeof customerMessageTemplates;

// Exactly the template's value names, each a one-line string.
export type TemplateValues<Name extends CustomerMessageTemplateName> = Record<
  (typeof customerMessageTemplates)[Name]["values"][number],
  string
>;

// --- Dependencies.

// Spec K's notification router over the typed client with the internal key (procedure names as
// K has them). A refused call throws an error whose `refusalOf` reason is K's (template_not_found,
// template_superseded, ...). Null while the main API runs without the notification app.
export interface NotificationMessageGateway {
  enqueue(input: EnqueueInput): Promise<EnqueueResult>;
  listByBusinessRefs(input: ListByBusinessRefsInput): Promise<NotificationStatusView[]>;
  getStatus(input: { notificationId: string }): Promise<NotificationStatusView>;
  resend(input: ResendInput): Promise<ResendResult>;
  suppress(input: SuppressInput): Promise<SuppressResult>;
  resolveTemplate(input: ResolveTemplateInput): Promise<NotificationTemplateView>;
}

// Spec L's draws; injected so tests can fake them.
export type MessageDocuments = Pick<
  DocumentService,
  "ensureBillVersionDocument" | "ensureNoteDocument" | "drawPaymentReceipt"
>;

// Spec I's cancelled predicate.
export type MessageGstState = Pick<GstService, "getBillGstState">;

// How often a delegate or PDF step is tried, and the wait before each retry.
export interface DeliveryRetry {
  attempts: number;
  backoffMs: readonly number[];
}

// --- Inputs.

// Admin or salesman; a salesman acts only for Customers on their Active GatePass Route.
export const messageActorSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["admin", "salesman"]),
});
export type MessageActor = z.input<typeof messageActorSchema>;

// Exactly one paper.
export const listForDocumentInputSchema = z.union([
  z.object({ billId: z.string().uuid() }).strict(),
  z.object({ noteId: z.string().uuid() }).strict(),
  z.object({ paymentId: z.string().uuid() }).strict(),
  z.object({ refundId: z.string().uuid() }).strict(),
]);
export type ListForDocumentInput = z.input<typeof listForDocumentInputSchema>;

export const listForCustomerInputSchema = z.object({ customerId: z.string().uuid() });
export type ListForCustomerInput = z.input<typeof listForCustomerInputSchema>;

export const resendMessageInputSchema = z.object({ notificationId: z.string().uuid() });
export type ResendMessageInput = z.input<typeof resendMessageInputSchema>;

export const sendLatestBillInputSchema = z.object({ billId: z.string().uuid() });
export type SendLatestBillInput = z.input<typeof sendLatestBillInputSchema>;

// --- Results.

// One WhatsApp message as the papers show it. Never the phone, values or attachment key.
export interface CustomerMessageStatus {
  notificationId: string;
  kind: NotificationKind;
  businessRef: string;
  status: NotificationStatus;
  skipReason: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  failureCategory: FailureCategory | null;
  createdAt: Date;
  updatedAt: Date;
  // A `bill` message for the Bill's current version (Resend allowed); false for older versions
  // and every other kind.
  latestBill: boolean;
}

export interface SentMessageResult {
  notificationId: string;
  status: NotificationStatus;
}
