import { getProfileById } from "@repo/database/queries/auth";
import { getBillCustomerId, getBillVersionByNumber } from "@repo/database/queries/bills";
import {
  getMessageBill,
  listCustomerMessageDocuments,
  listNoteIdsForBills,
  listPaymentMessageEvents,
  listRefundMessageEvents,
  type MessageBill,
} from "@repo/database/queries/customer-messages";
import { getCustomerWithRouteById, type CustomerWithRoute } from "@repo/database/queries/customers";
import type { BillVersionHeader } from "@repo/database/queries/documents";
import { getNoteBillId } from "@repo/database/queries/ledger";
import { getPaymentCustomerId } from "@repo/database/queries/payments";
import { getRefundCustomerId } from "@repo/database/queries/refunds";
import { logger } from "@repo/logger";

import DocumentService, { type DocumentResult } from "../documents";
import {
  customerMessageRefused,
  errorMessageOf,
  forbidden,
  internalError,
  notFound,
  refusalOf,
} from "../errors";
import GatepassService from "../gatepass";
import GstService from "../gst";
import type { EnqueueInput, NotificationStatusView } from "../notification/model";
import type { AdminBillListener, AdminBillOutcome, NoteOutcome } from "../shared/bill-events";
import { assertCustomerActive } from "../shared/checkout";
import type {
  CheckoutListener,
  CheckoutOutcome,
  PaymentPostedEvent,
} from "../shared/checkout-events";
import type { AdminPaymentListener, AdminPaymentOutcome } from "../shared/payment-events";
import {
  customerMessageTemplates,
  listForCustomerInputSchema,
  listForDocumentInputSchema,
  messageActorSchema,
  resendMessageInputSchema,
  sendLatestBillInputSchema,
  type CustomerMessageStatus,
  type CustomerMessageTemplateName,
  type DeliveryRetry,
  type ListForCustomerInput,
  type ListForDocumentInput,
  type MessageActor,
  type MessageDocuments,
  type MessageGstState,
  type MessageLanguage,
  type NotificationMessageGateway,
  type ResendMessageInput,
  type SendLatestBillInput,
  type SentMessageResult,
  type TemplateValues,
} from "./model";
import {
  balanceAdjustment,
  balanceLine,
  formatMessageDate,
  formatRupees,
  modeWord,
  normalizePhone,
  noteStatusWord,
  oneLine,
  type NormalizedPhone,
} from "./wording";

// K takes at most this many refs per status read.
const REFS_PER_STATUS_READ = 200;

const DEFAULT_RETRY: DeliveryRetry = { attempts: 3, backoffMs: [250, 1_000] };

const TEMPLATE_SUPERSEDED_MESSAGE =
  "The message wording has changed since this was sent, so it cannot be resent.";

// --- business_ref and idempotency keys: deterministic from the document, ≤ 128 characters.

const refs = {
  billVersion: (billId: string, versionNumber: number) => `bill/${billId}/v${versionNumber}`,
  billCancel: (billId: string) => `bill/${billId}/cancel`,
  note: (noteId: string) => `note/${noteId}`,
  payment: (paymentId: string, eventId: string) => `payment/${paymentId}/${eventId}`,
  refund: (refundId: string, eventId: string) => `refund/${refundId}/${eventId}`,
};

function billMessageKey(billId: string, versionNumber: number) {
  return `bill|${refs.billVersion(billId, versionNumber)}`;
}

// The latest Bill key, or that key plus `|tv{n}` (Send latest Bill after a template change).
function isLatestBillKey(idempotencyKey: string, latestKey: string): boolean {
  if (idempotencyKey === latestKey) return true;
  return (
    idempotencyKey.startsWith(latestKey) && /^\|tv\d+$/.test(idempotencyKey.slice(latestKey.length))
  );
}

function latestBillKeyOf(bill: MessageBill): string {
  return billMessageKey(bill.billId, bill.latestVersionNumber);
}

// The document a business_ref names.
type ParsedRef =
  | { kind: "bill"; billId: string; versionNumber: number | null }
  | { kind: "note"; noteId: string }
  | { kind: "payment"; paymentId: string }
  | { kind: "refund"; refundId: string };

function parseRef(businessRef: string): ParsedRef | null {
  const [document, id, part] = businessRef.split("/");
  if (!id) return null;
  if (document === "bill") {
    const version = /^v(\d+)$/.exec(part ?? "");
    return { kind: "bill", billId: id, versionNumber: version ? Number(version[1]) : null };
  }
  if (document === "note") return { kind: "note", noteId: id };
  if (document === "payment") return { kind: "payment", paymentId: id };
  if (document === "refund") return { kind: "refund", refundId: id };
  return null;
}

function documentRefOf(input: ListForDocumentInput): ParsedRef {
  if ("billId" in input) return { kind: "bill", billId: input.billId, versionNumber: null };
  if ("noteId" in input) return { kind: "note", noteId: input.noteId };
  if ("paymentId" in input) return { kind: "payment", paymentId: input.paymentId };
  return { kind: "refund", refundId: input.refundId };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// Signed Balance change of one Note: + for a Debit Note, − for a Credit Note.
const signedNoteEffect = (note: NoteOutcome) =>
  note.kind === "debit_note" ? note.amountPaise : -note.amountPaise;

const isGstNote = (note: NoteOutcome) =>
  note.kind === "gst_credit_note" || note.kind === "debit_note";

// Who the message goes to, read when the instruction is built: the current phone and language.
interface Recipient {
  language: MessageLanguage;
  phone: NormalizedPhone;
}

// One instruction of a commit's chain. Its PDF step and supersede step run just before its own
// enqueue.
interface PlannedMessage {
  instruction: EnqueueInput;
  document?: () => Promise<DocumentResult>;
  supersede?: { billId: string; latestVersionNumber: number; reason: string };
}

// The Bill paper's frozen facts, from one bill_versions header.
interface BillPaper {
  billId: string;
  billVersionId: string;
  versionNumber: number;
  header: BillVersionHeader;
}

// WhatsApp messages per money event (Spec J). Turns each committed Bill, Payment, Note and Refund
// outcome into an ordered list of template instructions and hands them, after commit, to the
// notification app (Spec K). Never writes a money row, a notification row or a pdf_key: PDFs are
// Spec L's, rows are K's. A failed step is logged and stops that commit's chain; the domain call
// already returned.
class CustomerMessageService {
  private readonly gatepassService = new GatepassService();

  // `notification` is null when the notification app is not configured (no NOTIFICATION_URL).
  public constructor(
    private readonly notification: NotificationMessageGateway | null = null,
    private readonly documents: MessageDocuments = new DocumentService(),
    private readonly gst: MessageGstState = new GstService(),
    private readonly retry: DeliveryRetry = DEFAULT_RETRY,
  ) {}

  // --- After-commit listeners (Specs F, G, H). Each runs once per commit.

  public readonly checkoutListener: CheckoutListener = (outcome) => this.onCheckout(outcome);
  public readonly adminBillListener: AdminBillListener = (outcome) => this.onAdminBill(outcome);
  public readonly adminPaymentListener: AdminPaymentListener = (outcome) =>
    this.onAdminPayment(outcome);

  // Book Now and fulfil: Bill, then Receipt (kept > ₹0). Field Payment:
  // Receipt.
  private async onCheckout(outcome: CheckoutOutcome): Promise<void> {
    const customerId = outcome.bill?.customerId ?? outcome.payment?.customerId;
    if (!customerId) return;
    const customer = await this.requireCustomer(customerId);
    const recipient = recipientOf(customer);
    const plans: PlannedMessage[] = [];
    if (outcome.bill) {
      const paper = await this.billPaperByNumber(outcome.bill.billId, outcome.bill.versionNumber);
      const bill = await this.billMessage(paper, outcome.bill.balanceAfterBillPaise, recipient);
      if (bill) plans.push(bill);
    }
    if (outcome.payment && outcome.payment.keptPaise > 0) {
      plans.push(this.receiptMessage(outcome.payment, customer, recipient));
    }
    await this.deliverInOrder(plans);
  }

  private async onAdminBill(outcome: AdminBillOutcome): Promise<void> {
    if (outcome.kind === "pre_order_cancelled") return;
    const recipient = recipientOf(await this.requireCustomer(outcome.customerId));
    const plans: PlannedMessage[] = [];

    switch (outcome.kind) {
      case "bill_raised": {
        const paper = await this.billPaperByNumber(outcome.billId, outcome.versionNumber);
        const bill = await this.billMessage(paper, outcome.balanceAfterPaise, recipient);
        if (bill) plans.push(bill);
        break;
      }
      // Latest Bill; then GST Note messages when the frozen buyer GSTIN is
      // present and the commit raised GST Notes, otherwise the Bill corrected update when the
      // Balance changed.
      case "bill_corrected": {
        const paper = await this.billPaperByNumber(outcome.billId, outcome.versionNumber);
        const bill = await this.billMessage(paper, outcome.balanceAfterPaise, recipient);
        if (bill) plans.push(bill);
        const gstNotes = outcome.notes.filter(isGstNote);
        if (paper.header.letterhead.buyer.gstin && gstNotes.length > 0) {
          for (const note of byNoteNumber(gstNotes)) {
            plans.push(
              this.gstNoteMessage(
                paper,
                note,
                outcome.reason,
                outcome.balanceAfterPaise,
                recipient,
              ),
            );
          }
        } else if (outcome.balanceChanged) {
          plans.push(this.billCorrectedMessage(paper, outcome, recipient));
        }
        break;
      }
      // Unsent Bill messages skipped, the cancellation, then the GST Credit Note (GSTIN only).
      case "bill_cancelled": {
        const paper = await this.latestBillPaper(outcome.billId);
        plans.push(this.cancellationMessage(paper, outcome, recipient));
        if (paper.header.letterhead.buyer.gstin && isGstNote(outcome.creditNote)) {
          plans.push(
            this.gstNoteMessage(
              paper,
              outcome.creditNote,
              outcome.reason,
              outcome.balanceAfterPaise,
              recipient,
            ),
          );
        }
        break;
      }
      // A GST Note to a GSTIN Customer gets only its statutory message; any other Note the Note
      // update.
      case "note_raised": {
        const paper = await this.latestBillPaper(outcome.billId);
        if (paper.header.letterhead.buyer.gstin && isGstNote(outcome.note)) {
          plans.push(
            this.gstNoteMessage(
              paper,
              outcome.note,
              outcome.reason,
              outcome.balanceAfterPaise,
              recipient,
            ),
          );
        } else {
          plans.push(this.noteUpdateMessage(paper, outcome, recipient));
        }
        break;
      }
    }
    await this.deliverInOrder(plans);
  }

  // Office Payment: Receipt. Payment Correct with kept changed and every Refund add or amount
  // Correct: the account update. A mode or reference-only Correct sends nothing.
  private async onAdminPayment(outcome: AdminPaymentOutcome): Promise<void> {
    if (outcome.kind === "payment_corrected" && !outcome.keptChanged) return;
    if (outcome.kind === "refund_corrected" && !outcome.amountChanged) return;
    const customer = await this.requireCustomer(outcome.customerId);
    const recipient = recipientOf(customer);
    let plan: PlannedMessage | null = null;

    switch (outcome.kind) {
      case "payment_added":
        if (outcome.keptPaise > 0) {
          plan = this.receiptMessage(
            {
              paymentId: outcome.paymentId,
              postedEventId: outcome.postedEventId,
              paymentNumber: outcome.paymentNumber,
              customerId: outcome.customerId,
              mode: outcome.mode,
              keptPaise: outcome.keptPaise,
              returnedPaise: outcome.returnedPaise,
              balanceAfterPaise: outcome.balanceAfterPaise,
            },
            customer,
            recipient,
          );
        }
        break;
      case "payment_corrected": {
        const businessRef = refs.payment(outcome.paymentId, outcome.adjustedEventId);
        plan = {
          instruction: this.instruction("paymentCorrected", businessRef, recipient, {
            ...customerValues(customer.shopName, customer.routeName),
            receipt_number: outcome.paymentNumber,
            previous_amount: formatRupees(outcome.keptBeforePaise),
            corrected_amount: formatRupees(outcome.keptAfterPaise),
            difference: formatRupees(outcome.differencePaise),
            reason: oneLine(outcome.reason),
            balance_line: balanceLine("now", outcome.balanceAfterPaise, recipient.language),
          }),
        };
        break;
      }
      case "refund_added":
      case "refund_corrected": {
        const eventId =
          outcome.kind === "refund_added" ? outcome.postedEventId : outcome.adjustedEventId;
        const amountPaise =
          outcome.kind === "refund_added" ? outcome.amountPaise : outcome.amountAfterPaise;
        plan = {
          instruction: this.instruction(
            "refund",
            refs.refund(outcome.refundId, eventId),
            recipient,
            {
              ...customerValues(customer.shopName, customer.routeName),
              refund_number: outcome.refundNumber,
              refund_amount: formatRupees(amountPaise),
              refund_mode: modeWord(outcome.mode, recipient.language),
              balance_line: balanceLine("remaining", outcome.balanceAfterPaise, recipient.language),
            },
          ),
        };
        break;
      }
    }
    await this.deliverInOrder(plan ? [plan] : []);
  }

  // --- Resend and Send latest Bill.

  // A new attempt on the stored message (same template version, values and PDF) to the
  // Customer's current phone. Writes no money row.
  public async resend(actor: MessageActor, input: ResendMessageInput): Promise<SentMessageResult> {
    const parsedActor = messageActorSchema.parse(actor);
    const parsedInput = resendMessageInputSchema.parse(input);
    const notification = this.requireNotification();
    const row = await notification.getStatus({ notificationId: parsedInput.notificationId });
    const ref = parseRef(row.businessRef);
    if (!ref) throw notFound(`Message ${row.notificationId} names no document`);
    const customer = await this.requireCustomer(await this.customerIdOfRef(ref));
    await this.assertMayAct(parsedActor, customer);
    // A deactivated Customer is read-only: statuses stay readable, nothing is sent.
    assertCustomerActive(customer, customer.id);
    if (row.status === "pending") throw messagePendingRefusal();

    if (row.kind === "bill") {
      if (ref.kind !== "bill") {
        throw internalError(`Bill message ${row.notificationId} has no Bill`);
      }
      const bill = await this.requireMessageBill(ref.billId);
      if (!isLatestBillKey(row.idempotencyKey, latestBillKeyOf(bill))) {
        throw customerMessageRefused(
          "not_latest_bill",
          "This is an older version of the Bill and cannot be resent. Use Send latest Bill.",
        );
      }
      await this.assertBillSendable(ref.billId);
    }

    const to = requirePhone(recipientOf(customer));
    return this.resendRow(row.notificationId, to, row.kind === "bill");
  }

  // Pushes the Bill's current version: a fresh message, or a resend of the one already made for
  // it. After a Bill template change, a fresh message under `|tv{n}`. Writes no money row and
  // never replaces a pdf_key.
  public async sendLatestBill(
    actor: MessageActor,
    input: SendLatestBillInput,
  ): Promise<SentMessageResult> {
    const parsedActor = messageActorSchema.parse(actor);
    const parsedInput = sendLatestBillInputSchema.parse(input);
    const notification = this.requireNotification();
    const customerId = await getBillCustomerId(parsedInput.billId);
    if (!customerId) throw notFound(`Bill ${parsedInput.billId} not found`);
    const customer = await this.requireCustomer(customerId);
    await this.assertMayAct(parsedActor, customer);
    assertCustomerActive(customer, customer.id);
    await this.assertBillSendable(parsedInput.billId);

    const bill = await this.requireMessageBill(parsedInput.billId);
    const latestKey = latestBillKeyOf(bill);
    const paper = await this.latestBillPaper(parsedInput.billId);
    const recipient = recipientOf(customer);
    // Not a domain commit: the Balance as it stands now.
    const instruction = {
      ...this.billInstruction(paper, customer.balancePaise, recipient),
      idempotencyKey: latestKey,
    };

    await this.supersedeOlderBillRows(paper.billId, paper.versionNumber, "newer Bill", (key) =>
      isLatestBillKey(key, latestKey),
    );
    const document = await this.documents.ensureBillVersionDocument(paper.billVersionId);
    const attachment = pdfAttachment(document);

    const first = await notification.enqueue({ ...instruction, attachment });
    if (first.created) return { notificationId: first.notificationId, status: first.status };
    if (first.status === "pending") throw messagePendingRefusal();
    const to = requirePhone(recipient);
    try {
      return await this.resendRow(first.notificationId, to, true, { rethrowSuperseded: true });
    } catch (error) {
      if (refusalOf(error)?.reason !== "template_superseded") throw error;
    }

    const template = await notification.resolveTemplate({
      provider: "whatsapp",
      templateId: customerMessageTemplates.bill.templateId,
      language: recipient.language,
    });
    const fresh = await notification.enqueue({
      ...instruction,
      idempotencyKey: `${latestKey}|tv${template.version}`,
      attachment,
    });
    if (fresh.created) return { notificationId: fresh.notificationId, status: fresh.status };
    if (fresh.status === "pending") throw messagePendingRefusal();
    return this.resendRow(fresh.notificationId, to, true);
  }

  // --- Status reads.

  // Every message about one paper: a Bill (all versions, its account updates, cancellation and
  // Notes), a Note, a Payment (all events) or a Refund (all events). Newest first. A salesman
  // reads only papers of Customers on his Active GatePass Route, as for Resend.
  public async listForDocument(
    actor: MessageActor,
    input: ListForDocumentInput,
  ): Promise<CustomerMessageStatus[]> {
    const parsedActor = messageActorSchema.parse(actor);
    const parsedInput = listForDocumentInputSchema.parse(input);
    const customer = await this.requireCustomer(
      await this.customerIdOfRef(documentRefOf(parsedInput)),
    );
    await this.assertMayAct(parsedActor, customer);
    let businessRefs: string[];
    let bills: MessageBill[] = [];

    if ("billId" in parsedInput) {
      const bill = await this.requireMessageBill(parsedInput.billId);
      bills = [bill];
      businessRefs = [
        ...billRefsOf(bill),
        ...(await listNoteIdsForBills([bill.billId])).map(refs.note),
      ];
    } else if ("noteId" in parsedInput) {
      businessRefs = [refs.note(parsedInput.noteId)];
    } else if ("paymentId" in parsedInput) {
      const events = await listPaymentMessageEvents([parsedInput.paymentId]);
      businessRefs = events.map((event) => refs.payment(event.documentId, event.eventId));
    } else {
      const events = await listRefundMessageEvents([parsedInput.refundId]);
      businessRefs = events.map((event) => refs.refund(event.documentId, event.eventId));
    }
    return this.statusesOf(businessRefs, bills);
  }

  // Admin's per-Customer message history: every Bill, Note, Payment and Refund message. Newest
  // first.
  public async listForCustomer(input: ListForCustomerInput): Promise<CustomerMessageStatus[]> {
    const parsedInput = listForCustomerInputSchema.parse(input);
    const documents = await listCustomerMessageDocuments(parsedInput.customerId);
    const businessRefs = [
      ...documents.bills.flatMap(billRefsOf),
      ...documents.noteIds.map(refs.note),
      ...documents.paymentEvents.map((event) => refs.payment(event.documentId, event.eventId)),
      ...documents.refundEvents.map((event) => refs.refund(event.documentId, event.eventId)),
    ];
    return this.statusesOf(businessRefs, documents.bills);
  }

  // --- Instructions.

  // Null while the Bill is withheld: cancelled.
  private async billMessage(
    paper: BillPaper,
    balancePaise: number,
    recipient: Recipient,
  ): Promise<PlannedMessage | null> {
    const state = await this.gst.getBillGstState({ billId: paper.billId });
    if (state.cancelled) return null;
    const instruction = {
      ...this.billInstruction(paper, balancePaise, recipient),
      idempotencyKey: billMessageKey(paper.billId, paper.versionNumber),
    };
    return {
      instruction,
      document: () => this.documents.ensureBillVersionDocument(paper.billVersionId),
      supersede: {
        billId: paper.billId,
        latestVersionNumber: paper.versionNumber,
        reason: "newer Bill",
      },
    };
  }

  private billInstruction(paper: BillPaper, balancePaise: number, recipient: Recipient) {
    const { header } = paper;
    return this.instruction(
      "bill",
      refs.billVersion(paper.billId, paper.versionNumber),
      recipient,
      {
        ...letterheadValues(header),
        bill_number: header.number,
        bill_date: formatMessageDate(header.billDate, recipient.language),
        bill_amount: formatRupees(header.totalPaise),
        balance_line: balanceLine("bill", balancePaise, recipient.language),
      },
    );
  }

  private receiptMessage(
    payment: PaymentPostedEvent,
    customer: CustomerWithRoute,
    recipient: Recipient,
  ): PlannedMessage {
    return {
      instruction: this.instruction(
        "receipt",
        refs.payment(payment.paymentId, payment.postedEventId),
        recipient,
        {
          ...customerValues(customer.shopName, customer.routeName),
          receipt_number: payment.paymentNumber,
          amount_received: formatRupees(payment.keptPaise),
          payment_mode: modeWord(payment.mode, recipient.language),
          balance_line: balanceLine("receipt", payment.balanceAfterPaise, recipient.language),
        },
      ),
      document: () =>
        this.documents.drawPaymentReceipt({
          paymentId: payment.paymentId,
          postedPaymentEventId: payment.postedEventId,
          balanceAfterPaise: payment.balanceAfterPaise,
        }),
    };
  }

  private billCorrectedMessage(
    paper: BillPaper,
    outcome: Extract<AdminBillOutcome, { kind: "bill_corrected" }>,
    recipient: Recipient,
  ): PlannedMessage {
    const balanceChangePaise = outcome.notes.reduce(
      (total, note) => total + signedNoteEffect(note),
      0,
    );
    return {
      instruction: this.instruction(
        "billCorrected",
        refs.billVersion(paper.billId, paper.versionNumber),
        recipient,
        {
          ...letterheadValues(paper.header),
          bill_number: paper.header.number,
          reason: oneLine(outcome.reason),
          balance_adjustment: balanceAdjustment(balanceChangePaise, recipient.language),
          balance_line: balanceLine("now", outcome.balanceAfterPaise, recipient.language),
        },
      ),
    };
  }

  private cancellationMessage(
    paper: BillPaper,
    outcome: Extract<AdminBillOutcome, { kind: "bill_cancelled" }>,
    recipient: Recipient,
  ): PlannedMessage {
    return {
      instruction: this.instruction("cancellation", refs.billCancel(paper.billId), recipient, {
        ...letterheadValues(paper.header),
        bill_number: paper.header.number,
        reason: oneLine(outcome.reason),
        amount_reversed: formatRupees(outcome.creditNote.amountPaise),
        balance_line: balanceLine("remaining", outcome.balanceAfterPaise, recipient.language),
      }),
      supersede: {
        billId: paper.billId,
        latestVersionNumber: paper.versionNumber,
        reason: "cancelled",
      },
    };
  }

  // The statutory GST Credit or Debit Note, with its PDF.
  private gstNoteMessage(
    paper: BillPaper,
    note: NoteOutcome,
    reason: string,
    balancePaise: number,
    recipient: Recipient,
  ): PlannedMessage {
    const common = {
      ...letterheadValues(paper.header),
      note_number: note.number,
      bill_number: paper.header.number,
      reason: oneLine(reason),
      balance_line: balanceLine("now", balancePaise, recipient.language),
    };
    const instruction =
      note.kind === "debit_note"
        ? this.instruction("gstDebitNote", refs.note(note.noteId), recipient, {
            ...common,
            additional_amount: formatRupees(note.amountPaise),
          })
        : this.instruction("gstCreditNote", refs.note(note.noteId), recipient, {
            ...common,
            credit_amount: formatRupees(note.amountPaise),
          });
    return { instruction, document: () => this.documents.ensureNoteDocument(note.noteId) };
  }

  private noteUpdateMessage(
    paper: BillPaper,
    outcome: Extract<AdminBillOutcome, { kind: "note_raised" }>,
    recipient: Recipient,
  ): PlannedMessage {
    return {
      instruction: this.instruction("noteUpdate", refs.note(outcome.note.noteId), recipient, {
        ...letterheadValues(paper.header),
        note_number: outcome.note.number,
        bill_number: paper.header.number,
        status: noteStatusWord(outcome.note.kind, recipient.language),
        reason: oneLine(outcome.reason),
        balance_adjustment: balanceAdjustment(outcome.differencePaise, recipient.language),
        balance_line: balanceLine("now", outcome.balanceAfterPaise, recipient.language),
      }),
    };
  }

  // The instruction for one template: its kind, id, the values in template order, the Customer's
  // language and phone (or skip reason). Idempotency key = `{kind}|{businessRef}`.
  private instruction<Name extends CustomerMessageTemplateName>(
    name: Name,
    businessRef: string,
    recipient: Recipient,
    values: TemplateValues<Name>,
  ): EnqueueInput {
    const template = customerMessageTemplates[name];
    const orderedValues: Record<string, string> = {};
    for (const valueName of template.values) {
      orderedValues[valueName] = (values as Record<string, string>)[valueName]!;
    }
    return {
      idempotencyKey: `${template.kind}|${businessRef}`,
      kind: template.kind,
      to: recipient.phone.to,
      ...(recipient.phone.to === null ? { skipReason: recipient.phone.skipReason } : {}),
      provider: "whatsapp",
      templateId: template.templateId,
      language: recipient.language,
      values: orderedValues,
      businessRef,
    };
  }

  // --- Delegation.

  // Strictly in order: the next instruction starts only after the previous one is acknowledged.
  // The first step that fails stops the rest of this commit's chain.
  private async deliverInOrder(plans: PlannedMessage[]): Promise<void> {
    if (plans.length === 0) return;
    if (!this.notification) {
      logger.warn("WhatsApp messages skipped: the notification app is not configured", {
        businessRefs: plans.map((plan) => plan.instruction.businessRef),
      });
      return;
    }
    for (const plan of plans) {
      if (!(await this.deliver(this.notification, plan))) return;
    }
  }

  // False when the chain must stop.
  private async deliver(
    notification: NotificationMessageGateway,
    plan: PlannedMessage,
  ): Promise<boolean> {
    const { instruction } = plan;
    try {
      if (plan.supersede) {
        const { billId, latestVersionNumber, reason } = plan.supersede;
        await this.withRetries(() =>
          this.supersedeOlderBillRows(
            billId,
            latestVersionNumber,
            reason,
            (key) => key === instruction.idempotencyKey,
          ),
        );
      }
      let attachment: EnqueueInput["attachment"];
      if (plan.document) attachment = pdfAttachment(await this.withRetries(plan.document));
      await this.withRetries(() =>
        notification.enqueue(attachment ? { ...instruction, attachment } : instruction),
      );
      return true;
    } catch (error) {
      logger.error("WhatsApp message not handed to the notification app; its chain stops", {
        businessRef: instruction.businessRef,
        idempotencyKey: instruction.idempotencyKey,
        reason: refusalOf(error)?.reason ?? null,
        error: errorMessageOf(error),
      });
      return false;
    }
  }

  // The same call again with short backoff. A refusal (K's template codes, L's document codes) is
  // a decision, not a hiccup: never retried.
  private async withRetries<T>(call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await call();
      } catch (error) {
        if (refusalOf(error) || attempt >= this.retry.attempts) throw error;
        await wait(this.retry.backoffMs[attempt - 1] ?? this.retry.backoffMs.at(-1) ?? 0);
      }
    }
  }

  // Asks K to skip every still-pending Bill message of this Bill that has not left yet, except
  // the ones `keep` names. One that already left stays in history.
  private async supersedeOlderBillRows(
    billId: string,
    latestVersionNumber: number,
    reason: string,
    keep: (idempotencyKey: string) => boolean,
  ): Promise<void> {
    const notification = this.requireNotification();
    const businessRefs = Array.from({ length: latestVersionNumber }, (_, index) =>
      refs.billVersion(billId, index + 1),
    );
    const rows = await this.statusRows(businessRefs);
    for (const row of rows) {
      if (row.kind !== "bill" || row.status !== "pending" || keep(row.idempotencyKey)) continue;
      await notification.suppress({ notificationId: row.notificationId, reason });
    }
  }

  private async resendRow(
    notificationId: string,
    to: string,
    isBill: boolean,
    options: { rethrowSuperseded?: boolean } = {},
  ): Promise<SentMessageResult> {
    try {
      return await this.requireNotification().resend({ notificationId, to });
    } catch (error) {
      if (refusalOf(error)?.reason !== "template_superseded" || options.rethrowSuperseded) {
        throw error;
      }
      throw customerMessageRefused(
        "template_superseded",
        isBill
          ? `${TEMPLATE_SUPERSEDED_MESSAGE} Use Send latest Bill.`
          : TEMPLATE_SUPERSEDED_MESSAGE,
      );
    }
  }

  // --- Reads.

  private async statusRows(businessRefs: string[]): Promise<NotificationStatusView[]> {
    const notification = this.requireNotification();
    const rows: NotificationStatusView[] = [];
    for (const batch of chunk([...new Set(businessRefs)], REFS_PER_STATUS_READ)) {
      rows.push(...(await notification.listByBusinessRefs({ businessRefs: batch })));
    }
    return rows;
  }

  private async statusesOf(
    businessRefs: string[],
    bills: MessageBill[],
  ): Promise<CustomerMessageStatus[]> {
    if (businessRefs.length === 0) return [];
    const latestKeys = new Map(bills.map((bill) => [bill.billId, latestBillKeyOf(bill)]));
    const rows = await this.statusRows(businessRefs);
    return rows
      .map((row) => {
        const ref = parseRef(row.businessRef);
        const latestKey = ref?.kind === "bill" ? latestKeys.get(ref.billId) : undefined;
        const { idempotencyKey, ...status } = row;
        return {
          ...status,
          latestBill:
            row.kind === "bill" &&
            latestKey !== undefined &&
            isLatestBillKey(idempotencyKey, latestKey),
        };
      })
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
  }

  private async billPaperByNumber(billId: string, versionNumber: number): Promise<BillPaper> {
    const version = await getBillVersionByNumber(billId, versionNumber);
    if (!version) throw internalError(`Bill ${billId} has no version ${versionNumber}`);
    return {
      billId,
      billVersionId: version.id,
      versionNumber,
      header: version.header as BillVersionHeader,
    };
  }

  private async latestBillPaper(billId: string): Promise<BillPaper> {
    const bill = await this.requireMessageBill(billId);
    return this.billPaperByNumber(billId, bill.latestVersionNumber);
  }

  private async requireMessageBill(billId: string): Promise<MessageBill> {
    const bill = await getMessageBill(billId);
    if (!bill) throw notFound(`Bill ${billId} not found`);
    return bill;
  }

  private async requireCustomer(customerId: string): Promise<CustomerWithRoute> {
    const customer = await getCustomerWithRouteById(customerId);
    if (!customer) throw notFound(`Customer ${customerId} not found`);
    return customer;
  }

  private async customerIdOfRef(ref: ParsedRef): Promise<string> {
    let customerId: string | null;
    switch (ref.kind) {
      case "bill":
        customerId = await getBillCustomerId(ref.billId);
        break;
      case "note": {
        const billId = await getNoteBillId(ref.noteId);
        customerId = billId ? await getBillCustomerId(billId) : null;
        break;
      }
      case "payment":
        customerId = await getPaymentCustomerId(ref.paymentId);
        break;
      case "refund":
        customerId = await getRefundCustomerId(ref.refundId);
        break;
    }
    if (!customerId) throw notFound("The message's document was not found");
    return customerId;
  }

  // Admin: any Customer. Salesman: only with an Active GatePass on the Customer's current Route.
  private async assertMayAct(actor: MessageActor, customer: CustomerWithRoute): Promise<void> {
    const profile = await getProfileById(actor.profileId);
    if (!profile || profile.role !== actor.role) throw forbidden();
    if (actor.role === "admin") return;
    const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(actor.profileId);
    if (!activeGatepass) {
      throw customerMessageRefused(
        "no_active_gatepass",
        "You have no Active GatePass today, so you cannot see or resend WhatsApp messages.",
      );
    }
    if (activeGatepass.route.id !== customer.routeId) {
      throw customerMessageRefused(
        "customer_not_on_route",
        "This Customer is not on your Active GatePass Route.",
        { customerId: customer.id },
      );
    }
  }

  // Never a cancelled Bill (no void paper reaches the Customer).
  private async assertBillSendable(billId: string): Promise<void> {
    const state = await this.gst.getBillGstState({ billId });
    if (state.cancelled) {
      throw customerMessageRefused("bill_cancelled", "This Bill is cancelled and cannot be sent.");
    }
  }

  private requireNotification(): NotificationMessageGateway {
    if (!this.notification) {
      throw customerMessageRefused(
        "notification_unavailable",
        "WhatsApp messages are not set up on this server.",
      );
    }
    return this.notification;
  }
}

function recipientOf(customer: CustomerWithRoute): Recipient {
  return { language: customer.preferredLanguage, phone: normalizePhone(customer.phone) };
}

function requirePhone(recipient: Recipient): string {
  if (recipient.phone.to === null) {
    throw customerMessageRefused(
      "phone_unusable",
      "The Customer's phone is not a valid Indian mobile. Fix the phone first.",
      { skipReason: recipient.phone.skipReason },
    );
  }
  return recipient.phone.to;
}

const messagePendingRefusal = () =>
  customerMessageRefused(
    "message_pending",
    "This WhatsApp is still being sent. Resend it once it has an outcome.",
  );

// `Shop, Route`: two Customers can share one phone.
function customerLine(shopName: string, routeName: string): string {
  return oneLine(`${shopName}, ${routeName}`);
}

// The `customer` and `route_name` values, each on one line.
function customerValues(shopName: string, routeName: string) {
  return { customer: customerLine(shopName, routeName), route_name: oneLine(routeName) };
}

function letterheadValues(header: BillVersionHeader) {
  const { buyer, route } = header.letterhead;
  return customerValues(buyer.shop_name, route.name);
}

function pdfAttachment(document: DocumentResult): NonNullable<EnqueueInput["attachment"]> {
  return { key: document.key, type: "pdf", filename: document.filename };
}

function byNoteNumber(notes: NoteOutcome[]): NoteOutcome[] {
  return [...notes].sort((first, second) => first.number.localeCompare(second.number));
}

// Every ref a Bill's own messages use: each version (Bill and Bill corrected) and the cancel.
function billRefsOf(bill: MessageBill): string[] {
  return [
    ...Array.from({ length: bill.latestVersionNumber }, (_, index) =>
      refs.billVersion(bill.billId, index + 1),
    ),
    refs.billCancel(bill.billId),
  ];
}

export default CustomerMessageService;
export {
  customerMessageTemplates,
  listForCustomerInputSchema,
  listForDocumentInputSchema,
  messageActorSchema,
  resendMessageInputSchema,
  sendLatestBillInputSchema,
} from "./model";
export type {
  CustomerMessageStatus,
  DeliveryRetry,
  ListForCustomerInput,
  ListForDocumentInput,
  MessageActor,
  MessageDocuments,
  MessageGstState,
  MessageLanguage,
  NotificationMessageGateway,
  ResendMessageInput,
  SendLatestBillInput,
  SentMessageResult,
} from "./model";
export { formatMessageDate, formatRupees, normalizePhone } from "./wording";
