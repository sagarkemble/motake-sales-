import { randomUUID } from "node:crypto";

import {
  getBillVersionSnapshot,
  getNoteById,
  getPaymentById,
} from "@repo/database/queries/documents";

import AdminBillService from "../admin-bills";
import CustomerMessageService, { type NotificationMessageGateway } from "../customer-messages";
import DocumentService, { type DocumentResult, type DrawPaymentReceiptInput } from "../documents";
import { conflict, documentRefused, notFound, notificationRefused } from "../errors";
import GstService from "../gst";
import type {
  EnqueueInput,
  EnqueueResult,
  NotificationRefusalReason,
  NotificationStatus,
  NotificationStatusView,
  ResendInput,
} from "../notification";
import OrderService from "../orders";
import PaymentService from "../payments";
import RefundService from "../refunds";
import { MemoryDocumentStore } from "./memory-document-store";

// Spec J tests: the notification app (Spec K) and the PDF draws (Spec L) are faked at their
// seams; every domain service is wired to CustomerMessageService the way the API wires it.

interface StoredMessage {
  notificationId: string;
  instruction: EnqueueInput;
  status: NotificationStatus;
  skipReason: string | null;
  // The template version the row was stored with (K's highest version at enqueue).
  templateVersion: number;
  // The provider accepted the current run: suppress is too late.
  sent: boolean;
  resends: string[];
  createdAt: Date;
}

// K's router in memory: honours idempotency keys (same key → same id, created false), keeps rows
// whose status a test sets, and refuses a resend once the template has a newer version.
export class RecordingNotificationGateway implements NotificationMessageGateway {
  public readonly rows: StoredMessage[] = [];
  // Every call in order, e.g. `enqueue bill|bill/…/v1`, `suppress <id>`.
  public readonly calls: string[] = [];
  // The next N enqueues fail like a timeout; `enqueueAlwaysFails` fails them all.
  public enqueueFailures = 0;
  public enqueueAlwaysFails = false;
  // Refuses every enqueue with this reason (a missing or unverified template row).
  public enqueueRefusal: NotificationRefusalReason | null = null;
  private readonly templateVersions = new Map<string, number>();
  private clock = 0;

  // Inserts a newer version of a template in one language (resend of older rows is refused).
  public setTemplateVersion(templateId: string, language: string, version: number): void {
    this.templateVersions.set(`${templateId}|${language}`, version);
  }

  // What K stored, in enqueue order: the instructions that made a row.
  public get instructions(): EnqueueInput[] {
    return this.rows.map((row) => row.instruction);
  }

  public row(notificationId: string): StoredMessage {
    const row = this.rows.find((candidate) => candidate.notificationId === notificationId);
    if (!row) throw new Error(`No message ${notificationId}`);
    return row;
  }

  public rowByKey(idempotencyKey: string): StoredMessage {
    const row = this.rows.find(
      (candidate) => candidate.instruction.idempotencyKey === idempotencyKey,
    );
    if (!row) throw new Error(`No message ${idempotencyKey}`);
    return row;
  }

  public setStatus(notificationId: string, status: NotificationStatus, sent = false): void {
    const row = this.row(notificationId);
    row.status = status;
    row.sent = sent;
  }

  public async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    this.calls.push(`enqueue ${input.idempotencyKey}`);
    const existing = this.rows.find(
      (row) => row.instruction.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      return {
        notificationId: existing.notificationId,
        status: existing.status,
        skipReason: existing.skipReason,
        created: false,
      };
    }
    if (this.enqueueAlwaysFails || this.enqueueFailures > 0) {
      this.enqueueFailures = Math.max(0, this.enqueueFailures - 1);
      throw new Error("fetch failed: notification app timed out");
    }
    if (this.enqueueRefusal) {
      throw notificationRefused(this.enqueueRefusal, `Refused ${input.templateId}`);
    }
    const skipReason = input.to === null ? (input.skipReason ?? "missing phone") : null;
    const row: StoredMessage = {
      notificationId: randomUUID(),
      instruction: input,
      status: skipReason ? "skipped" : "pending",
      skipReason,
      templateVersion: this.versionOf(input.templateId, input.language),
      sent: false,
      resends: [],
      createdAt: new Date(Date.UTC(2026, 0, 1) + (this.clock += 1000)),
    };
    this.rows.push(row);
    return { notificationId: row.notificationId, status: row.status, skipReason, created: true };
  }

  public async listByBusinessRefs(input: { businessRefs: string[] }) {
    this.calls.push(`list ${input.businessRefs.length}`);
    if (input.businessRefs.length < 1 || input.businessRefs.length > 200) {
      throw new Error(`K takes 1 to 200 refs, got ${input.businessRefs.length}`);
    }
    return this.rows
      .filter((row) => input.businessRefs.includes(row.instruction.businessRef))
      .map((row) => this.viewOf(row))
      .reverse();
  }

  public async getStatus(input: { notificationId: string }): Promise<NotificationStatusView> {
    const row = this.rows.find((candidate) => candidate.notificationId === input.notificationId);
    if (!row) throw notFound(`Notification ${input.notificationId} not found`);
    return this.viewOf(row);
  }

  public async resend(input: ResendInput) {
    this.calls.push(`resend ${input.notificationId}`);
    const row = this.row(input.notificationId);
    if (row.status === "pending") throw conflict("This WhatsApp is still being sent");
    if (
      this.versionOf(row.instruction.templateId, row.instruction.language) > row.templateVersion
    ) {
      throw notificationRefused(
        "template_superseded",
        `Template ${row.instruction.templateId} has a newer version`,
      );
    }
    row.resends.push(input.to ?? "");
    row.status = "pending";
    row.skipReason = null;
    row.sent = false;
    return { notificationId: row.notificationId, status: row.status };
  }

  public async suppress(input: { notificationId: string; reason: string }) {
    this.calls.push(`suppress ${input.notificationId}`);
    const row = this.row(input.notificationId);
    if (row.status === "pending" && !row.sent) {
      row.status = "skipped";
      row.skipReason = `superseded: ${input.reason}`;
      return { suppressed: true as const };
    }
    return { suppressed: false as const, status: row.status };
  }

  public async resolveTemplate(input: {
    provider: "whatsapp" | "sms";
    templateId: string;
    language: "mr" | "hi" | "en";
  }) {
    return {
      id: randomUUID(),
      provider: input.provider,
      templateId: input.templateId,
      language: input.language,
      version: this.versionOf(input.templateId, input.language),
      templateVariables: [],
      documentType: "none" as const,
      verified: true,
      createdAt: new Date(),
    };
  }

  private versionOf(templateId: string, language: string): number {
    return this.templateVersions.get(`${templateId}|${language}`) ?? 1;
  }

  private viewOf(row: StoredMessage): NotificationStatusView {
    return {
      notificationId: row.notificationId,
      kind: row.instruction.kind,
      businessRef: row.instruction.businessRef,
      idempotencyKey: row.instruction.idempotencyKey,
      status: row.status,
      skipReason: row.skipReason,
      attemptCount: row.resends.length + (row.skipReason ? 0 : 1),
      lastAttemptAt: null,
      failureCategory: null,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    };
  }
}

export type DocumentCall =
  | { method: "ensureBillVersionDocument"; billVersionId: string }
  | { method: "replaceBillDocumentAfterIrnCorrect"; billId: string }
  | { method: "ensureNoteDocument"; noteId: string }
  | { method: "drawPaymentReceipt"; input: DrawPaymentReceiptInput };

const NOTE_PAPER: Record<string, string> = {
  gst_credit_note: "Credit Note",
  commercial_credit_note: "Credit Note",
  debit_note: "Debit Note",
};

// Spec L's draws, recorded: deterministic keys, L's file names (read from the stored numbers), and
// a draw that fails or refuses irn_missing when told.
export class FakeMessageDocuments {
  public readonly calls: DocumentCall[] = [];
  // The next N draws throw; `alwaysFails` makes every draw throw.
  public failures = 0;
  public alwaysFails = false;
  public refuseIrnMissing = false;
  private replaceCount = 0;

  public async ensureBillVersionDocument(billVersionId: string): Promise<DocumentResult> {
    this.calls.push({ method: "ensureBillVersionDocument", billVersionId });
    this.maybeFail();
    if (this.refuseIrnMissing) throw documentRefused("irn_missing", "IRN not recorded yet");
    const version = await getBillVersionSnapshot(billVersionId);
    return {
      key: `documents/bill-versions/${billVersionId}.pdf`,
      filename: `Motake Bill ${version!.header.number.replaceAll("/", "-")}.pdf`,
    };
  }

  public async replaceBillDocumentAfterIrnCorrect(billId: string): Promise<DocumentResult> {
    this.calls.push({ method: "replaceBillDocumentAfterIrnCorrect", billId });
    this.maybeFail();
    this.replaceCount += 1;
    return {
      key: `documents/bills/${billId}/irn-${this.replaceCount}.pdf`,
      filename: "Motake Bill replaced.pdf",
    };
  }

  public async ensureNoteDocument(noteId: string): Promise<DocumentResult> {
    this.calls.push({ method: "ensureNoteDocument", noteId });
    this.maybeFail();
    const note = await getNoteById(noteId);
    return {
      key: `documents/notes/${noteId}.pdf`,
      filename: `Motake ${NOTE_PAPER[note!.kind]} ${note!.number.replaceAll("/", "-")}.pdf`,
    };
  }

  public async drawPaymentReceipt(input: DrawPaymentReceiptInput): Promise<DocumentResult> {
    this.calls.push({ method: "drawPaymentReceipt", input });
    this.maybeFail();
    const payment = await getPaymentById(input.paymentId);
    return {
      key: `documents/receipts/${input.paymentId}/${input.postedPaymentEventId}.pdf`,
      filename: `Motake Receipt ${payment!.number.replaceAll("/", "-")}.pdf`,
    };
  }

  private maybeFail(): void {
    if (this.alwaysFails || this.failures > 0) {
      this.failures = Math.max(0, this.failures - 1);
      throw new Error("R2 put failed");
    }
  }
}

export interface MessageHarness {
  gateway: RecordingNotificationGateway;
  documents: FakeMessageDocuments;
  messages: CustomerMessageService;
  orderService: OrderService;
  paymentService: PaymentService;
  refundService: RefundService;
  adminBillService: AdminBillService;
  gstService: GstService;
}

// Fresh services per test, wired like packages/trpc/server/services. Retries wait 0 ms.
export function buildMessageHarness(): MessageHarness {
  const gateway = new RecordingNotificationGateway();
  const documents = new FakeMessageDocuments();
  const documentService = new DocumentService(new MemoryDocumentStore());
  const messages = new CustomerMessageService(gateway, documents, new GstService(documentService), {
    attempts: 3,
    backoffMs: [0, 0],
  });
  return {
    gateway,
    documents,
    messages,
    orderService: new OrderService(messages.checkoutListener),
    paymentService: new PaymentService(messages.checkoutListener, messages.adminPaymentListener),
    refundService: new RefundService(messages.adminPaymentListener),
    adminBillService: new AdminBillService(messages.adminBillListener),
    gstService: new GstService(documentService, messages.gstListener, messages.adminBillListener),
  };
}
