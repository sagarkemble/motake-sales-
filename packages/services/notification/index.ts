import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  checkDatabase,
  countHeldNotifications,
  countNotificationAttempts,
  deleteCachedMedia,
  findAttemptByProviderMessageId,
  getCachedMedia,
  getHighestTemplateVersion,
  getLatestAttemptNumber,
  getNotificationByIdempotencyKey,
  getNotificationStatusRow,
  hasCurrentRunSentAttemptOlderThan,
  hasHigherTemplateVersion,
  insertNotificationAttempt,
  insertNotificationIfNew,
  isNotificationHeld,
  listCurrentRunAttempts,
  listHeldNotifications,
  listNotificationStatusRowsByBusinessRefs,
  listNotificationTemplates,
  listUnqueuedPendingNotifications,
  lockNotificationWithTemplate,
  markAttemptFailed,
  setLockTimeout,
  updateNotification,
  upsertCachedMedia,
  type NotificationStatusRow,
} from "@repo/database/queries/notifications";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { isLockTimeout } from "@repo/database/queries/shared/pg-errors";
import type { SelectNotification, SelectNotificationTemplate } from "@repo/database/schema";
import { logger } from "@repo/logger";

import { badRequest, conflict, errorMessageOf, notFound, notificationRefused } from "../errors";
import {
  enqueueInputSchema,
  failRunInputSchema,
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
  type FailRunInput,
  type FailRunResult,
  type FailureCategory,
  type HealthReport,
  type ListByBusinessRefsInput,
  type ListTemplatesInput,
  type NotificationAttachment,
  type NotificationStatusView,
  type NotificationTemplateView,
  type ProviderStatusUpdate,
  type ResendInput,
  type ResumeHeldResult,
  type ResendResult,
  type ResolveTemplateInput,
  type SendAttemptOptions,
  type SendAttemptResult,
  type SuppressInput,
  type SuppressResult,
  type WebhookPostResult,
  type WebhookSubscriptionInput,
  type WhatsAppTokenState,
  type WhatsAppTokenStatus,
} from "./model";
import {
  formatProviderError,
  type DocumentReader,
  type NotificationDispatcher,
  type ProviderFailure,
  type SendTemplateResult,
  type TokenCheckResult,
  type WhatsAppProvider,
  type WhatsAppTokenSource,
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

// Meta accepted the current run this long ago (database clock) and the row is still pending, so
// no status webhook came: resend is allowed (the old run's late statuses are then older-attempt statuses and ignored).
const STALE_SENT_RESEND_AFTER_MS = ONE_DAY_MS;

// Resend and suppress wait at most this long for a send holding the row lock, then answer CONFLICT.
const INSTRUCTION_LOCK_TIMEOUT_MS = 3_000;

const SIGNATURE_PREFIX = "sha256=";

// A held send asks for a token sync this long after it; held sends in between share that one sync.
const DEFAULT_TOKEN_SYNC_DELAY_MS = 2_000;

export interface NotificationWebhookSecrets {
  // Meta app secret: HMAC key for `X-Hub-Signature-256`.
  appSecret: string;
  verifyToken: string;
}

// The two copies of the access token the sync works with (WhatsAppTokenStore in the app).
export interface NotificationTokenStore extends WhatsAppTokenSource {
  readVaultToken(): Promise<string | null>;
  writeWorkingToken(token: string): Promise<void>;
}

export interface NotificationServiceDependencies {
  provider: WhatsAppProvider;
  documentReader: DocumentReader;
  dispatcher: NotificationDispatcher;
  webhook: NotificationWebhookSecrets;
  tokenStore: NotificationTokenStore;
  tokenSyncDelayMs?: number;
}

type TokenSyncResume = "always" | "if_replaced";

interface TokenCheckOutcome {
  state: WhatsAppTokenState;
  replaced: boolean;
}

type MediaResult = { ok: true; mediaId: string; fromCache: boolean } | ProviderFailure;

function isValidPhone(phone: string | null | undefined): phone is string {
  return !!phone && phone.length <= MAX_PHONE_LENGTH && PHONE_PATTERN.test(phone);
}

// The Inngest event id of a run: the run's start, which is updated_at while the row is pending
// (enqueue and resend set it; sending never moves it). The same for every replay and sweep of one
// run, and new for every resend, even after a suppress that wrote no attempt.
function runKeyFor(notification: Pick<SelectNotification, "id" | "updatedAt">): string {
  return `notification/${notification.id}/run/${notification.updatedAt.getTime()}`;
}

// Same keys and values, whatever the order jsonb hands them back in.
function sameValues(saved: Record<string, string>, given: Record<string, string>): boolean {
  const sorted = (values: Record<string, string>) =>
    JSON.stringify(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return sorted(saved) === sorted(given);
}

const lockBusy = () =>
  conflict("This WhatsApp is being sent right now; try again in a few seconds");

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
function tokenStateOf(check: TokenCheckResult): WhatsAppTokenState {
  if (check === "ok") return "ok";
  return check === "auth_error" ? "invalid" : "unavailable";
}

class NotificationService {
  private readonly provider: WhatsAppProvider;
  private readonly documentReader: DocumentReader;
  private readonly dispatcher: NotificationDispatcher;
  private readonly webhook: NotificationWebhookSecrets;
  private readonly tokenStore: NotificationTokenStore;
  private readonly tokenSyncDelayMs: number;

  // In memory only: the app checks at start-up and every 5 minutes, so a restart re-learns it.
  private tokenState: { state: WhatsAppTokenState; checkedAt: Date | null } = {
    state: "unavailable",
    checkedAt: null,
  };
  private tokenSyncInFlight: Promise<WhatsAppTokenStatus> | null = null;
  private tokenSyncTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(dependencies: NotificationServiceDependencies) {
    this.provider = dependencies.provider;
    this.documentReader = dependencies.documentReader;
    this.dispatcher = dependencies.dispatcher;
    this.webhook = dependencies.webhook;
    this.tokenStore = dependencies.tokenStore;
    this.tokenSyncDelayMs = dependencies.tokenSyncDelayMs ?? DEFAULT_TOKEN_SYNC_DELAY_MS;
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
      await this.dispatchSafely(inserted.id, runKeyFor(inserted));
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
    const { notification, runKey } = await this.withInstructionLock(async (transaction) => {
      const row = await lockNotificationWithTemplate(parsedInput.notificationId, transaction);
      if (!row) throw notFound(`Notification ${parsedInput.notificationId} not found`);
      if (
        row.notification.status === "pending" &&
        !(await hasCurrentRunSentAttemptOlderThan(
          row.notification.id,
          STALE_SENT_RESEND_AFTER_MS,
          transaction,
        ))
      ) {
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
      return { notification: updated, runKey: runKeyFor(updated) };
    });

    await this.dispatchSafely(notification.id, runKey);
    return { notificationId: notification.id, status: notification.status };
  }

  // Only a still-pending run that has not reached the provider can be suppressed.
  public async suppress(input: SuppressInput): Promise<SuppressResult> {
    const parsedInput = suppressInputSchema.parse(input);
    return this.withInstructionLock(async (transaction) => {
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
    const result = await runInTransaction(async (transaction): Promise<SendAttemptResult> => {
      const row = await lockNotificationWithTemplate(parsedNotificationId, transaction);
      if (!row || row.notification.status !== "pending") {
        return { outcome: "noop", failureCategory: null };
      }
      const { notification, template } = row;
      // The provider already accepted this run (the row stays pending until a webhook): a step
      // retry after a lost step result must not send a second WhatsApp.
      const currentRunAttempts = await listCurrentRunAttempts(notification, transaction);
      if (currentRunAttempts.some((attempt) => attempt.status === "sent")) {
        return { outcome: "noop", failureCategory: null };
      }
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
      // Held, on every try and in media upload: the row stays pending and a working token resumes
      // it as a new run (Spec J-0).
      if (result.category === "auth_error") {
        return { outcome: "held", failureCategory: result.category };
      }
      if (result.retriable && !parsedOptions.isFinalTry) {
        return { outcome: "retry", failureCategory: result.category };
      }
      await updateNotification(notification.id, { status: "failed" }, transaction);
      return {
        outcome: result.retriable ? "failed" : "terminal",
        failureCategory: result.category,
      };
    });
    if (result.outcome === "held") this.requestTokenSync();
    return result;
  }

  // The send function gave up on a run by throwing (database or pool error on the last try), so
  // no try marked the row. Fails it unless the run moved on: another run started (run key
  // differs), it is no longer pending, or the provider already accepted it.
  public async failRun(input: FailRunInput): Promise<FailRunResult> {
    const parsedInput = failRunInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const row = await lockNotificationWithTemplate(parsedInput.notificationId, transaction);
      if (!row) return { failed: false, status: null };
      const { notification } = row;
      if (notification.status !== "pending" || runKeyFor(notification) !== parsedInput.runKey) {
        return { failed: false, status: notification.status };
      }
      const currentRunAttempts = await listCurrentRunAttempts(notification, transaction);
      if (currentRunAttempts.some((attempt) => attempt.status === "sent")) {
        return { failed: false, status: notification.status };
      }
      logger.error("Notification send gave up; marking the row failed", {
        notificationId: notification.id,
        runKey: parsedInput.runKey,
        error: parsedInput.error,
      });
      await updateNotification(notification.id, { status: "failed" }, transaction);
      return { failed: true, status: "failed" };
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
      if (await this.dispatchSafely(notification.id, runKeyFor(notification))) {
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
    return {
      status: database === "ok" && inngest === "ok" ? "ok" : "degraded",
      database,
      inngest,
      whatsappToken: this.tokenState.state,
    };
  }

  // ---- WhatsApp access token (Spec J-0) ----

  // Vault is the master: a different Vault token that works is written to the secret file (even
  // over a file token that still works); otherwise the file token is checked. A working token then
  // resumes held messages. Runs at start-up, every 5 minutes, after a held send, and when the
  // Admin saves a token.
  public async syncToken(): Promise<WhatsAppTokenStatus> {
    return this.runTokenSync("always");
  }

  public async tokenStatus(): Promise<WhatsAppTokenStatus> {
    return { ...this.tokenState, heldCount: await countHeldNotifications() };
  }

  // A new run (new run key) for every held row, like resend, only while the token works. Rows that
  // are no longer held (suppressed, resent, already resumed) are skipped.
  public async resumeHeld(): Promise<ResumeHeldResult> {
    if (this.tokenState.state !== "ok") {
      throw notificationRefused(
        "token_not_working",
        "WhatsApp messages are paused: the access token is not working. Save a working token first.",
      );
    }
    let queued = 0;
    for (const held of await listHeldNotifications()) {
      let runKey: string | null;
      try {
        runKey = await this.withInstructionLock(async (transaction) => {
          const row = await lockNotificationWithTemplate(held.id, transaction);
          if (!row || !(await isNotificationHeld(held.id, transaction))) return null;
          const updated = await updateNotification(held.id, { status: "pending" }, transaction);
          return runKeyFor(updated);
        });
      } catch (error) {
        // A send holds the row right now; the next sync or a press of the button picks it up.
        logger.error("Could not resume a held notification", {
          notificationId: held.id,
          error: errorMessageOf(error),
        });
        continue;
      }
      if (runKey === null) continue;
      // A lost dispatch is queued by the recovery sweep, so the row counts as queued either way.
      await this.dispatchSafely(held.id, runKey);
      queued += 1;
    }
    if (queued > 0) logger.info(`Resumed ${queued} held WhatsApp notification(s)`);
    return { queued };
  }

  // ---- Helpers ----

  // One sync at a time; a call during a sync gets that sync's result.
  private runTokenSync(resume: TokenSyncResume): Promise<WhatsAppTokenStatus> {
    if (!this.tokenSyncInFlight) {
      this.tokenSyncInFlight = this.performTokenSync(resume).finally(() => {
        this.tokenSyncInFlight = null;
      });
    }
    return this.tokenSyncInFlight;
  }

  private async performTokenSync(resume: TokenSyncResume): Promise<WhatsAppTokenStatus> {
    let outcome: TokenCheckOutcome;
    try {
      outcome = await this.checkAndRepairToken();
    } catch (error) {
      logger.error("WhatsApp token sync failed", {
        error: errorMessageOf(error),
      });
      outcome = { state: "unavailable", replaced: false };
    }
    const previous = this.tokenState;
    this.tokenState = { state: outcome.state, checkedAt: new Date() };
    if (outcome.replaced) logger.info("WhatsApp access token replaced from Vault");
    if (outcome.state !== "ok" && (previous.state === "ok" || previous.checkedAt === null)) {
      logger.error(`WhatsApp access token is ${outcome.state}; messages are held`);
    }
    // A held send's sync resumes only on a fresh token: a refusal the check cannot see (for
    // example a Meta payment problem) would otherwise resume and hold again in a tight loop.
    if (outcome.state === "ok" && (resume === "always" || outcome.replaced)) {
      try {
        await this.resumeHeld();
      } catch (error) {
        logger.error("Could not resume held notifications", {
          error: errorMessageOf(error),
        });
      }
    }
    return this.tokenStatus();
  }

  // Vault is the master copy: a different Vault token that checks ok replaces the file token, even
  // a file token that still works (an Admin rotation). A refused or uncheckable Vault token never
  // replaces the file; the file token is then checked on its own.
  private async checkAndRepairToken(): Promise<TokenCheckOutcome> {
    const workingToken = await this.tokenStore.readWorkingToken();

    let vaultToken: string | null = null;
    let vaultReadable = true;
    try {
      vaultToken = await this.tokenStore.readVaultToken();
    } catch (error) {
      vaultReadable = false;
      logger.error("Could not read the WhatsApp access token from Vault", {
        error: errorMessageOf(error),
      });
    }

    // An empty secret file always takes the Vault token, checked or not: sends then hold on a bad
    // token (and the Admin banner shows) instead of the app refusing to start.
    if (!workingToken && vaultToken) {
      await this.tokenStore.writeWorkingToken(vaultToken);
      const filledCheck = await this.provider.checkToken(vaultToken);
      return { state: tokenStateOf(filledCheck), replaced: true };
    }

    let vaultCheck: TokenCheckResult | null = null;
    if (vaultToken && vaultToken !== workingToken) {
      vaultCheck = await this.provider.checkToken(vaultToken);
      if (vaultCheck === "ok") {
        await this.tokenStore.writeWorkingToken(vaultToken);
        return { state: "ok", replaced: true };
      }
    }

    const workingCheck = workingToken ? await this.provider.checkToken(workingToken) : "auth_error";
    if (workingCheck === "ok") return { state: "ok", replaced: false };
    const uncheckable =
      workingCheck === "unavailable" || vaultCheck === "unavailable" || !vaultReadable;
    return { state: uncheckable ? "unavailable" : "invalid", replaced: false };
  }

  // Debounced: held sends within the delay share one sync. The timer never keeps the process up.
  private requestTokenSync(): void {
    if (this.tokenSyncTimer) return;
    this.tokenSyncTimer = setTimeout(() => {
      this.tokenSyncTimer = null;
      void this.runTokenSync("if_replaced");
    }, this.tokenSyncDelayMs);
    this.tokenSyncTimer.unref?.();
  }

  private async replayEnqueue(
    existing: SelectNotification,
    input: ReturnType<typeof enqueueInputSchema.parse>,
  ): Promise<EnqueueResult> {
    const differs =
      existing.kind !== input.kind ||
      existing.businessRef !== input.businessRef ||
      !sameValues(existing.templateValues, input.values) ||
      existing.attachmentKey !== (input.attachment?.key ?? null);
    if (differs) {
      logger.error("Enqueue replay differs from the saved notification; first write wins", {
        notificationId: existing.id,
        idempotencyKey: existing.idempotencyKey,
      });
    }
    if (existing.status === "pending" && (await countNotificationAttempts(existing.id)) === 0) {
      await this.dispatchSafely(existing.id, runKeyFor(existing));
    }
    return {
      notificationId: existing.id,
      status: existing.status,
      skipReason: existing.skipReason,
      created: false,
    };
  }

  // Resend and suppress: a send holds the row lock across R2 and Meta, so wait only a few seconds
  // and answer a typed CONFLICT instead of hanging the main API.
  private async withInstructionLock<T>(work: (transaction: DbExecutor) => Promise<T>): Promise<T> {
    try {
      return await runInTransaction(async (transaction) => {
        await setLockTimeout(INSTRUCTION_LOCK_TIMEOUT_MS, transaction);
        return work(transaction);
      });
    } catch (error) {
      if (isLockTimeout(error)) throw lockBusy();
      throw error;
    }
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
        error: errorMessageOf(error),
      });
      return false;
    }
  }
}

export default NotificationService;
export type { WhatsAppTokenState, WhatsAppTokenStatus, ResumeHeldResult } from "./model";
export {
  MetaWhatsAppProvider,
  META_GRAPH_API_VERSION,
  classifyMetaError,
} from "./meta-whatsapp-provider";
export { R2DocumentReader, type R2DocumentReaderConfig } from "./r2-document-reader";
export {
  WhatsAppTokenStore,
  type WhatsAppTokenMetadata,
  type WhatsAppTokenStoreConfig,
} from "./whatsapp-token-store";
export type {
  DocumentReader,
  NotificationDispatcher,
  ProviderFailure,
  ReadDocumentResult,
  SendTemplateInput,
  SendTemplateResult,
  TemplateHeader,
  TokenCheckResult,
  UploadMediaResult,
  WhatsAppProvider,
  WhatsAppTokenSource,
} from "./provider";
export type {
  ApplyStatusResult,
  EnqueueInput,
  EnqueueResult,
  FailRunInput,
  FailRunResult,
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
