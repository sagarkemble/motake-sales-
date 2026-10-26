import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  checkDatabase,
  countNotificationAttempts,
  deleteCachedMedia,
  findAttemptByProviderMessageId,
  getCachedMedia,
  getHighestTemplateVersion,
  getLatestAttemptNumber,
  getNotificationByIdempotencyKey,
  getNotificationStatusRow,
  hasHigherTemplateVersion,
  insertNotificationAttempt,
  insertNotificationIfNew,
  listCurrentRunAttempts,
  listNotificationStatusRowsByBusinessRefs,
  listNotificationTemplates,
  listUnqueuedPendingNotifications,
  lockNotificationWithTemplate,
  markAttemptFailed,
  updateNotification,
  upsertCachedMedia,
  type NotificationStatusRow,
} from "@repo/database/queries/notifications";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { SelectNotification, SelectNotificationTemplate } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { badRequest, conflict, notFound, notificationRefused } from "../errors";
import {
  enqueueInputSchema,
  failureCategories,
  listByBusinessRefsInputSchema,
  listTemplatesInputSchema,
  notificationIdSchema,
  providerStatusUpdateSchema,
  resendInputSchema,
  resolveTemplateInputSchema,
  sendAttemptOptionsSchema,
  suppressInputSchema,
  webhookSubscriptionInputSchema,
  type ApplyStatusResult,
  type EnqueueInput,
  type EnqueueResult,
  type FailureCategory,
  type HealthReport,
  type ListByBusinessRefsInput,
  type ListTemplatesInput,
  type NotificationAttachment,
  type NotificationStatusView,
  type NotificationTemplateView,
  type ProviderStatusUpdate,
  type ResendInput,
  type ResendResult,
  type ResolveTemplateInput,
  type SendAttemptOptions,
  type SendAttemptResult,
  type SuppressInput,
  type SuppressResult,
  type WebhookPostResult,
  type WebhookSubscriptionInput,
} from "./model";
import {
  formatProviderError,
  type DocumentReader,
  type NotificationDispatcher,
  type ProviderFailure,
  type SendTemplateResult,
  type WhatsAppProvider,
} from "./provider";

// `+` then 8 to 15 digits, and never longer than the column.
const PHONE_PATTERN = /^\+[0-9]{8,15}$/;
const MAX_PHONE_LENGTH = 20;
const DEFAULT_SKIP_REASON = "missing phone";
const INVALID_PHONE_REASON = "invalid phone";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// WhatsApp media lifetime; a cached id is reused until a day before it expires.
const MEDIA_LIFETIME_MS = 30 * ONE_DAY_MS;
const MEDIA_REUSE_MARGIN_MS = ONE_DAY_MS;

// WhatsApp size limits per media type.
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];

// A pending run with no attempt after this long lost its dispatch.
const RECOVERY_AGE_SECONDS = 2 * 60;

const SIGNATURE_PREFIX = "sha256=";

export interface NotificationWebhookSecrets {
  // Meta app secret: HMAC key for `X-Hub-Signature-256`.
  appSecret: string;
  verifyToken: string;
}

export interface NotificationServiceDependencies {
  provider: WhatsAppProvider;
  documentReader: DocumentReader;
  dispatcher: NotificationDispatcher;
  webhook: NotificationWebhookSecrets;
}

type MediaResult = { ok: true; mediaId: string; fromCache: boolean } | ProviderFailure;

function isValidPhone(phone: string | null | undefined): phone is string {
  return !!phone && phone.length <= MAX_PHONE_LENGTH && PHONE_PATTERN.test(phone);
}

// The Inngest event id of a run: the attempt count at queue time plus one.
function runKeyFor(notificationId: string, attemptCount: number): string {
  return `notification/${notificationId}/run/${attemptCount + 1}`;
}

// Constant time, whatever the lengths.
function secretsMatch(given: string, expected: string): boolean {
  const givenDigest = createHash("sha256").update(given).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(givenDigest, expectedDigest) && given.length === expected.length;
}

function failureCategoryOf(error: string | null): FailureCategory {
  const category = error?.split(":", 1)[0]?.trim();
  return (failureCategories as readonly string[]).includes(category ?? "")
    ? (category as FailureCategory)
    : "unknown";
}

function toStatusView(row: NotificationStatusRow): NotificationStatusView {
  const { notification } = row;
  return {
    notificationId: notification.id,
    kind: notification.kind,
    businessRef: notification.businessRef,
    idempotencyKey: notification.idempotencyKey,
    status: notification.status,
    skipReason: notification.skipReason,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
    failureCategory:
      notification.status === "failed" ? failureCategoryOf(row.lastAttemptError) : null,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

function toTemplateView(template: SelectNotificationTemplate): NotificationTemplateView {
  return {
    id: template.id,
    provider: template.provider,
    templateId: template.templateId,
    language: template.language,
    version: template.version,
    templateVariables: template.templateVariables,
    documentType: template.documentType,
    verified: template.verified,
    createdAt: template.createdAt,
  };
}

// Names must match the template's blanks exactly; WhatsApp refuses empty values and values with a
// newline, a tab or more than four spaces in a row.
function assertValuesMatchTemplate(
  template: SelectNotificationTemplate,
  values: Record<string, string>,
): void {
  const expectedNames = template.templateVariables;
  const givenNames = Object.keys(values);
  const missing = expectedNames.filter((name) => !(name in values));
  const extra = givenNames.filter((name) => !expectedNames.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw notificationRefused(
      "template_values_mismatch",
      `Values do not match template ${template.templateId} v${template.version}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`,
    );
  }
  for (const name of expectedNames) {
    const value = values[name]!;
    if (value.length === 0 || /[\n\r\t]/.test(value) || / {5,}/.test(value)) {
      throw notificationRefused(
        "template_values_mismatch",
        `Value "${name}" is empty or has a newline, a tab or more than four spaces in a row`,
      );
    }
  }
}

function assertAttachmentMatchesTemplate(
  template: SelectNotificationTemplate,
  attachment: NotificationAttachment | undefined,
): void {
  const matches =
    template.documentType === "none" ? !attachment : attachment?.type === template.documentType;
  if (!matches) {
    throw notificationRefused(
      "attachment_mismatch",
      template.documentType === "none"
        ? `Template ${template.templateId} carries no document`
        : `Template ${template.templateId} needs a ${template.documentType} attachment`,
    );
  }
}

function mediaFailure(retriable: boolean, message: string): ProviderFailure {
  return {
    ok: false,
    retriable,
    category: retriable ? "provider_unavailable" : "media_error",
    code: null,
    message,
  };
}

// Transport-only WhatsApp notifications (ADR-0001, Spec K). Persists before it acknowledges, sends
// provider-approved templates only, and never looks at Bills, Payments, Notes or Customers.
class NotificationService {
  private readonly provider: WhatsAppProvider;
  private readonly documentReader: DocumentReader;
  private readonly dispatcher: NotificationDispatcher;
  private readonly webhook: NotificationWebhookSecrets;

  public constructor(dependencies: NotificationServiceDependencies) {
    this.provider = dependencies.provider;
    this.documentReader = dependencies.documentReader;
    this.dispatcher = dependencies.dispatcher;
    this.webhook = dependencies.webhook;
  }

  // ---- Instructions ----

  public async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const parsedInput = enqueueInputSchema.parse(input);

    // A replay is never refused because the template changed after the first call.
    const existing = await getNotificationByIdempotencyKey(parsedInput.idempotencyKey);
    if (existing) return this.replayEnqueue(existing, parsedInput);

    if (parsedInput.provider === "sms") {
      throw notificationRefused("provider_not_supported", "There is no SMS sender yet");
    }
    const template = await getHighestTemplateVersion({
      provider: parsedInput.provider,
      templateId: parsedInput.templateId,
      language: parsedInput.language,
    });
    if (!template) {
      throw notificationRefused(
        "template_not_found",
        `No ${parsedInput.provider} template ${parsedInput.templateId} in ${parsedInput.language}`,
      );
    }
    if (!template.verified) {
      throw notificationRefused(
        "template_not_verified",
        `Template ${template.templateId} v${template.version} (${template.language}) is not verified`,
      );
    }
    assertValuesMatchTemplate(template, parsedInput.values);
    assertAttachmentMatchesTemplate(template, parsedInput.attachment);

    let skipReason: string | null = null;
    if (parsedInput.to === null) {
      skipReason = parsedInput.skipReason ?? DEFAULT_SKIP_REASON;
    } else if (!isValidPhone(parsedInput.to)) {
      skipReason = INVALID_PHONE_REASON;
    }
    const storedPhone =
      parsedInput.to !== null && parsedInput.to.length <= MAX_PHONE_LENGTH ? parsedInput.to : null;

    const inserted = await insertNotificationIfNew({
      kind: parsedInput.kind,
      status: skipReason ? "skipped" : "pending",
      businessRef: parsedInput.businessRef,
      idempotencyKey: parsedInput.idempotencyKey,
      recipientPhone: storedPhone,
      notificationTemplateId: template.id,
      templateValues: parsedInput.values,
      attachmentKey: parsedInput.attachment?.key ?? null,
      attachmentType: parsedInput.attachment?.type ?? null,
      attachmentFilename: parsedInput.attachment?.filename ?? null,
      skipReason,
    });
    if (!inserted) {
      // Lost a race with a parallel call carrying the same key.
      const winner = await getNotificationByIdempotencyKey(parsedInput.idempotencyKey);
      if (!winner) throw conflict("Notification was saved and removed concurrently; retry");
      return this.replayEnqueue(winner, parsedInput);
    }

    if (inserted.status === "pending") {
      await this.dispatchSafely(inserted.id, runKeyFor(inserted.id, 0));
    }
    return {
      notificationId: inserted.id,
      status: inserted.status,
      skipReason: inserted.skipReason,
      created: true,
    };
  }

  public async getStatus(notificationId: string): Promise<NotificationStatusView> {
    const parsedNotificationId = notificationIdSchema.parse(notificationId);
    const row = await getNotificationStatusRow(parsedNotificationId);
    if (!row) throw notFound(`Notification ${parsedNotificationId} not found`);
    return toStatusView(row);
  }

  public async listByBusinessRefs(
    input: ListByBusinessRefsInput,
  ): Promise<NotificationStatusView[]> {
    const parsedInput = listByBusinessRefsInputSchema.parse(input);
    const rows = await listNotificationStatusRowsByBusinessRefs(parsedInput.businessRefs);
    return rows.map(toStatusView);
  }

  // A new attempt on the same saved template version, values and attachment; never repeats the
  // financial action. Who may resend is the main API's rule.
  public async resend(input: ResendInput): Promise<ResendResult> {
    const parsedInput = resendInputSchema.parse(input);
    const { notification, runKey } = await runInTransaction(async (transaction) => {
      const row = await lockNotificationWithTemplate(parsedInput.notificationId, transaction);
      if (!row) throw notFound(`Notification ${parsedInput.notificationId} not found`);
      if (row.notification.status === "pending") {
        throw conflict("This WhatsApp is still being sent; resend it once it has an outcome");
      }
      if (await hasHigherTemplateVersion(row.template, transaction)) {
        throw notificationRefused(
          "template_superseded",
          `Template ${row.template.templateId} (${row.template.language}) has a newer version than v${row.template.version}; send a new message instead`,
        );
      }
      if (parsedInput.to !== undefined && !isValidPhone(parsedInput.to)) {
        throw badRequest(`Phone ${parsedInput.to} is not + followed by 8 to 15 digits`);
      }
      const phone = parsedInput.to ?? row.notification.recipientPhone;
      if (!isValidPhone(phone)) throw badRequest("No valid phone to resend to");

      const updated = await updateNotification(
        row.notification.id,
        { status: "pending", recipientPhone: phone, skipReason: null },
        transaction,
      );
      const attemptCount = await countNotificationAttempts(row.notification.id, transaction);
      return { notification: updated, runKey: runKeyFor(row.notification.id, attemptCount) };
    });

    await this.dispatchSafely(notification.id, runKey);
    return { notificationId: notification.id, status: notification.status };
  }

  // Only a still-pending run that has not reached the provider can be suppressed.
  public async suppress(input: SuppressInput): Promise<SuppressResult> {
    const parsedInput = suppressInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const row = await lockNotificationWithTemplate(parsedInput.notificationId, transaction);
      if (!row) throw notFound(`Notification ${parsedInput.notificationId} not found`);
      const { notification } = row;
      if (notification.status === "pending") {
        const currentRunAttempts = await listCurrentRunAttempts(notification, transaction);
        if (!currentRunAttempts.some((attempt) => attempt.status === "sent")) {
          await updateNotification(
            notification.id,
            { status: "skipped", skipReason: `superseded: ${parsedInput.reason}` },
            transaction,
          );
          return { suppressed: true };
        }
      }
      return { suppressed: false, status: notification.status };
    });
  }

  // ---- Templates (read-only) ----

  public async listTemplates(input: ListTemplatesInput = {}): Promise<NotificationTemplateView[]> {
    const parsedInput = listTemplatesInputSchema.parse(input);
    const templates = await listNotificationTemplates(parsedInput);
    return templates.map(toTemplateView);
  }

  // The version enqueue would use now, verified or not.
  public async resolveTemplate(input: ResolveTemplateInput): Promise<NotificationTemplateView> {
    const parsedInput = resolveTemplateInputSchema.parse(input);
    const template = await getHighestTemplateVersion(parsedInput);
    if (!template) {
      throw notFound(
        `No ${parsedInput.provider} template ${parsedInput.templateId} in ${parsedInput.language}`,
      );
    }
    return toTemplateView(template);
  }

  // ---- Sending (one Inngest try) ----

  // Holds the notification lock across the provider call, so a suppress or resend waits for the
  // attempt row. Meta accepting the request leaves the row pending until a webhook arrives.
  public async sendAttempt(
    notificationId: string,
    options: SendAttemptOptions,
  ): Promise<SendAttemptResult> {
    const parsedNotificationId = notificationIdSchema.parse(notificationId);
    const parsedOptions = sendAttemptOptionsSchema.parse(options);
    return runInTransaction(async (transaction) => {
      const row = await lockNotificationWithTemplate(parsedNotificationId, transaction);
      if (!row || row.notification.status !== "pending") {
        return { outcome: "noop", failureCategory: null };
      }
      const { notification, template } = row;
      const result = await this.deliver(notification, template, transaction);

      if (result.ok) {
        await insertNotificationAttempt(
          {
            notificationId: notification.id,
            status: "sent",
            provider: this.provider.providerName,
            providerMessageId: result.providerMessageId,
          },
          transaction,
        );
        return { outcome: "sent", failureCategory: null };
      }

      await insertNotificationAttempt(
        {
          notificationId: notification.id,
          status: "failed",
          provider: this.provider.providerName,
          error: formatProviderError(result),
        },
        transaction,
      );
      if (result.retriable && !parsedOptions.isFinalTry) {
        return { outcome: "retry", failureCategory: result.category };
      }
      await updateNotification(notification.id, { status: "failed" }, transaction);
      return {
        outcome: result.retriable ? "failed" : "terminal",
        failureCategory: result.category,
      };
    });
  }

  private async deliver(
    notification: SelectNotification,
    template: SelectNotificationTemplate,
    executor: DbExecutor,
  ): Promise<SendTemplateResult> {
    if (!isValidPhone(notification.recipientPhone)) {
      return {
        ok: false,
        retriable: false,
        category: "invalid_recipient",
        code: null,
        message: "No valid phone on the notification",
      };
    }
    const send = (mediaId: string | null) =>
      this.provider.sendTemplate({
        to: notification.recipientPhone!,
        templateName: template.templateId,
        language: template.language,
        bodyParams: template.templateVariables.map((name) => notification.templateValues[name]!),
        header:
          mediaId && notification.attachmentFilename
            ? {
                type: notification.attachmentType === "image" ? "image" : "document",
                mediaId,
                filename: notification.attachmentFilename,
              }
            : null,
      });

    if (!notification.attachmentKey) return send(null);

    const media = await this.mediaFor(notification, template, false, executor);
    if (!media.ok) return media;
    const result = await send(media.mediaId);
    if (result.ok || result.code !== this.provider.mediaErrorCode || !media.fromCache) {
      return result;
    }

    // The cached id no longer works: upload once more and send again in this same try.
    await deleteCachedMedia(template.provider, notification.attachmentKey, executor);
    const freshMedia = await this.mediaFor(notification, template, true, executor);
    if (!freshMedia.ok) return freshMedia;
    return send(freshMedia.mediaId);
  }

  // A cached provider media id, or the Document read from the private bucket and uploaded.
  private async mediaFor(
    notification: SelectNotification,
    template: SelectNotificationTemplate,
    forceUpload: boolean,
    executor: DbExecutor,
  ): Promise<MediaResult> {
    const objectKey = notification.attachmentKey!;
    if (!forceUpload) {
      const cached = await getCachedMedia(template.provider, objectKey, executor);
      if (cached && cached.expiresAt.getTime() - Date.now() > MEDIA_REUSE_MARGIN_MS) {
        return { ok: true, mediaId: cached.providerMediaId, fromCache: true };
      }
    }

    const document = await this.documentReader.read(objectKey);
    if (!document.ok) {
      return mediaFailure(document.reason === "unavailable", document.message);
    }

    let mimeType: string;
    let maxBytes: number;
    if (notification.attachmentType === "image") {
      if (!document.contentType || !ALLOWED_IMAGE_MIME_TYPES.includes(document.contentType)) {
        return mediaFailure(
          false,
          `Image ${objectKey} is ${document.contentType}, not JPEG or PNG`,
        );
      }
      mimeType = document.contentType;
      maxBytes = MAX_IMAGE_BYTES;
    } else {
      mimeType = "application/pdf";
      maxBytes = MAX_DOCUMENT_BYTES;
    }
    if (document.bytes.byteLength > maxBytes) {
      return mediaFailure(
        false,
        `${objectKey} is ${document.bytes.byteLength} bytes, over the ${maxBytes}-byte limit`,
      );
    }

    const upload = await this.provider.uploadMedia({
      bytes: document.bytes,
      mimeType,
      filename: notification.attachmentFilename!,
    });
    if (!upload.ok) return upload;

    const uploadedAt = new Date();
    await upsertCachedMedia(
      {
        provider: template.provider,
        objectKey,
        providerMediaId: upload.mediaId,
        filename: notification.attachmentFilename!,
        mimeType,
        uploadedAt,
        expiresAt: new Date(uploadedAt.getTime() + MEDIA_LIFETIME_MS),
      },
      executor,
    );
    return { ok: true, mediaId: upload.mediaId, fromCache: false };
  }

  // ---- Provider status (webhook) ----

  // Forward-only: pending -> delivered -> read; failed only from pending. A status for an attempt
  // that is not the latest (or not in the current run) never moves the notification.
  public async applyProviderStatus(update: ProviderStatusUpdate): Promise<ApplyStatusResult> {
    const parsedUpdate = providerStatusUpdateSchema.parse(update);
    return runInTransaction(async (transaction) => {
      const attempt = await findAttemptByProviderMessageId(
        parsedUpdate.providerMessageId,
        transaction,
      );
      if (!attempt) {
        logger.info("WhatsApp status for an unknown message id ignored", {
          providerMessageId: parsedUpdate.providerMessageId,
          status: parsedUpdate.status,
        });
        return { applied: false, status: null };
      }
      const row = await lockNotificationWithTemplate(attempt.notificationId, transaction);
      if (!row) return { applied: false, status: null };
      const { notification } = row;
      const failureError = parsedUpdate.error ?? "unknown: delivery failed";

      const latestAttemptNumber = await getLatestAttemptNumber(notification.id, transaction);
      const inCurrentRun =
        notification.status !== "pending" ||
        (await listCurrentRunAttempts(notification, transaction)).some(
          (currentAttempt) => currentAttempt.id === attempt.id,
        );
      if (attempt.attemptNumber !== latestAttemptNumber || !inCurrentRun) {
        if (parsedUpdate.status === "failed") {
          await markAttemptFailed(attempt.id, failureError, transaction);
        }
        return { applied: false, status: notification.status };
      }

      const current = notification.status;
      if (parsedUpdate.status === "delivered" && current === "pending") {
        await updateNotification(notification.id, { status: "delivered" }, transaction);
        return { applied: true, status: "delivered" };
      }
      if (parsedUpdate.status === "read" && (current === "pending" || current === "delivered")) {
        await updateNotification(notification.id, { status: "read" }, transaction);
        return { applied: true, status: "read" };
      }
      if (parsedUpdate.status === "failed" && current === "pending") {
        await markAttemptFailed(attempt.id, failureError, transaction);
        await updateNotification(notification.id, { status: "failed" }, transaction);
        return { applied: true, status: "failed" };
      }
      return { applied: false, status: current };
    });
  }

  // Meta's GET subscribe check: the challenge to echo, or null for a 403.
  public verifyWebhookSubscription(input: WebhookSubscriptionInput): string | null {
    const parsedInput = webhookSubscriptionInputSchema.parse(input);
    if (
      parsedInput.mode !== "subscribe" ||
      parsedInput.verifyToken === undefined ||
      parsedInput.challenge === undefined
    ) {
      return null;
    }
    return secretsMatch(parsedInput.verifyToken, this.webhook.verifyToken)
      ? parsedInput.challenge
      : null;
  }

  // Checks `X-Hub-Signature-256` over the exact raw bytes before parsing, then extracts statuses
  // with their dedupe event id sha256(message id|status|timestamp).
  public handleWebhookPost(
    rawBody: Uint8Array | string,
    signatureHeader: string | undefined,
  ): WebhookPostResult {
    if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) return { accepted: false };
    const expected = createHmac("sha256", this.webhook.appSecret).update(rawBody).digest("hex");
    if (!secretsMatch(signatureHeader.slice(SIGNATURE_PREFIX.length).toLowerCase(), expected)) {
      return { accepted: false };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(
        typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8"),
      );
    } catch {
      logger.error("Signed WhatsApp webhook body is not JSON; ignored");
      return { accepted: true, statuses: [] };
    }
    const statuses = this.provider.parseStatusWebhook(payload).map((status) => ({
      ...status,
      eventId: createHash("sha256")
        .update(`${status.providerMessageId}|${status.status}|${status.timestamp}`)
        .digest("hex"),
    }));
    return { accepted: true, statuses };
  }

  // ---- Recovery and health ----

  // Pending runs with no attempt, older than two minutes: their dispatch was lost. The run key is
  // the same one the lost dispatch used, so a run already in flight is not queued twice.
  public async recoverUnqueued(): Promise<string[]> {
    const notifications = await listUnqueuedPendingNotifications(RECOVERY_AGE_SECONDS);
    const dispatched: string[] = [];
    for (const notification of notifications) {
      const attemptCount = await countNotificationAttempts(notification.id);
      if (await this.dispatchSafely(notification.id, runKeyFor(notification.id, attemptCount))) {
        dispatched.push(notification.id);
      }
    }
    return dispatched;
  }

  public async health(): Promise<HealthReport> {
    const database = await checkDatabase().then(
      () => "ok" as const,
      () => "down" as const,
    );
    const inngest = await this.dispatcher.isHealthy().then(
      (healthy) => (healthy ? ("ok" as const) : ("down" as const)),
      () => "down" as const,
    );
    return { status: database === "ok" && inngest === "ok" ? "ok" : "degraded", database, inngest };
  }

  // ---- Helpers ----

  private async replayEnqueue(
    existing: SelectNotification,
    input: ReturnType<typeof enqueueInputSchema.parse>,
  ): Promise<EnqueueResult> {
    const differs =
      existing.kind !== input.kind ||
      existing.businessRef !== input.businessRef ||
      JSON.stringify(existing.templateValues) !== JSON.stringify(input.values) ||
      existing.attachmentKey !== (input.attachment?.key ?? null);
    if (differs) {
      logger.error("Enqueue replay differs from the saved notification; first write wins", {
        notificationId: existing.id,
        idempotencyKey: existing.idempotencyKey,
      });
    }
    if (existing.status === "pending" && (await countNotificationAttempts(existing.id)) === 0) {
      await this.dispatchSafely(existing.id, runKeyFor(existing.id, 0));
    }
    return {
      notificationId: existing.id,
      status: existing.status,
      skipReason: existing.skipReason,
      created: false,
    };
  }

  // A failed dispatch never fails the caller: the row is saved and the recovery sweep queues it.
  private async dispatchSafely(notificationId: string, runKey: string): Promise<boolean> {
    try {
      await this.dispatcher.dispatch(notificationId, runKey);
      return true;
    } catch (error) {
      logger.error("Notification dispatch failed; the recovery sweep will queue it", {
        notificationId,
        runKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export default NotificationService;
export {
  MetaWhatsAppProvider,
  META_GRAPH_API_VERSION,
  classifyMetaError,
} from "./meta-whatsapp-provider";
export { R2DocumentReader, type R2DocumentReaderConfig } from "./r2-document-reader";
export type {
  DocumentReader,
  NotificationDispatcher,
  ProviderFailure,
  ReadDocumentResult,
  SendTemplateInput,
  SendTemplateResult,
  TemplateHeader,
  UploadMediaResult,
  WhatsAppProvider,
} from "./provider";
export type {
  ApplyStatusResult,
  EnqueueInput,
  EnqueueResult,
  FailureCategory,
  HealthReport,
  ListByBusinessRefsInput,
  ListTemplatesInput,
  NotificationRefusalReason,
  NotificationStatus,
  NotificationStatusView,
  NotificationTemplateView,
  ProviderStatusUpdate,
  ResendInput,
  ResendResult,
  ResolveTemplateInput,
  SendAttemptOptions,
  SendAttemptOutcome,
  SendAttemptResult,
  SuppressInput,
  SuppressResult,
  WebhookPostResult,
} from "./model";
