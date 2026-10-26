import { and, asc, desc, eq, gt, gte, inArray, lt, max, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  notificationAttemptsTable,
  notificationMediaTable,
  notificationTemplatesTable,
  notificationsTable,
  type InsertNotification,
  type InsertNotificationAttempt,
  type InsertNotificationMedia,
  type SelectNotification,
  type SelectNotificationAttempt,
  type SelectNotificationMedia,
  type SelectNotificationTemplate,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

export type NotificationProvider = SelectNotificationTemplate["provider"];
export type MessageLanguage = SelectNotificationTemplate["language"];
export type NotificationStatus = SelectNotification["status"];

export interface TemplateKey {
  provider: NotificationProvider;
  templateId: string;
  language: MessageLanguage;
}

// A notification with the latest attempt facts the status reads need.
export interface NotificationStatusRow {
  notification: SelectNotification;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lastAttemptError: string | null;
}

export interface NotificationWithTemplate {
  notification: SelectNotification;
  template: SelectNotificationTemplate;
}

// ---- Templates (read-only; rows are inserted by hand) ----

export async function listNotificationTemplates(
  filter: Partial<TemplateKey>,
  executor: DbExecutor = db,
): Promise<SelectNotificationTemplate[]> {
  return executor
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        filter.provider ? eq(notificationTemplatesTable.provider, filter.provider) : undefined,
        filter.templateId
          ? eq(notificationTemplatesTable.templateId, filter.templateId)
          : undefined,
        filter.language ? eq(notificationTemplatesTable.language, filter.language) : undefined,
      ),
    )
    .orderBy(
      asc(notificationTemplatesTable.templateId),
      asc(notificationTemplatesTable.language),
      desc(notificationTemplatesTable.version),
    );
}

// The highest version for (provider, template, language), verified or not.
export async function getHighestTemplateVersion(
  key: TemplateKey,
  executor: DbExecutor = db,
): Promise<SelectNotificationTemplate | undefined> {
  const [template] = await executor
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.provider, key.provider),
        eq(notificationTemplatesTable.templateId, key.templateId),
        eq(notificationTemplatesTable.language, key.language),
      ),
    )
    .orderBy(desc(notificationTemplatesTable.version))
    .limit(1);
  return template;
}

export async function getNotificationTemplateById(
  templateRowId: string,
  executor: DbExecutor = db,
): Promise<SelectNotificationTemplate | undefined> {
  const [template] = await executor
    .select()
    .from(notificationTemplatesTable)
    .where(eq(notificationTemplatesTable.id, templateRowId));
  return template;
}

// ---- Notifications ----

// First write wins: returns undefined when the idempotency key already has a row.
export async function insertNotificationIfNew(
  values: Omit<InsertNotification, "id" | "createdAt" | "updatedAt">,
  executor: DbExecutor = db,
): Promise<SelectNotification | undefined> {
  const [notification] = await executor
    .insert(notificationsTable)
    // updated_at marks the start of the current run, so it takes the database clock.
    .values({ ...values, updatedAt: sql`now()` })
    .onConflictDoNothing({ target: notificationsTable.idempotencyKey })
    .returning();
  return notification;
}

export async function getNotificationById(
  notificationId: string,
  executor: DbExecutor = db,
): Promise<SelectNotification | undefined> {
  const [notification] = await executor
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, notificationId));
  return notification;
}

export async function getNotificationByIdempotencyKey(
  idempotencyKey: string,
  executor: DbExecutor = db,
): Promise<SelectNotification | undefined> {
  const [notification] = await executor
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.idempotencyKey, idempotencyKey));
  return notification;
}

// Serialises send, resend, suppress and status changes on one notification.
export async function lockNotificationWithTemplate(
  notificationId: string,
  executor: DbExecutor,
): Promise<NotificationWithTemplate | undefined> {
  const [row] = await executor
    .select({ notification: notificationsTable, template: notificationTemplatesTable })
    .from(notificationsTable)
    .innerJoin(
      notificationTemplatesTable,
      eq(notificationTemplatesTable.id, notificationsTable.notificationTemplateId),
    )
    .where(eq(notificationsTable.id, notificationId))
    .for("update", { of: notificationsTable });
  return row;
}

// Caps how long the rest of the open transaction waits for a row lock; Postgres then raises
// 55P03 (`isLockTimeout`). `SET` takes no bind parameters, so the value is a checked integer.
export async function setLockTimeout(milliseconds: number, executor: DbExecutor): Promise<void> {
  if (!Number.isInteger(milliseconds) || milliseconds <= 0) {
    throw new Error(`Lock timeout must be a positive whole number of ms, got ${milliseconds}`);
  }
  await executor.execute(sql.raw(`SET LOCAL lock_timeout = '${milliseconds}ms'`));
}

// Every change takes the database clock for updated_at; on resend it starts the new run.
export async function updateNotification(
  notificationId: string,
  changes: Partial<Pick<InsertNotification, "status" | "recipientPhone" | "skipReason">>,
  executor: DbExecutor = db,
): Promise<SelectNotification> {
  const updatedRows = await executor
    .update(notificationsTable)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(notificationsTable.id, notificationId))
    .returning();
  return firstOrThrow(updatedRows, "updateNotification");
}

// Correlated subqueries spell out table names: Drizzle leaves columns unqualified in a
// single-table select, which would bind them to the inner table.
const attemptFacts = {
  attemptCount: sql<number>`(
    SELECT count(*)::int FROM notification_attempts AS attempt
    WHERE attempt.notification_id = notifications.id
  )`,
  lastAttemptAt: sql<Date | null>`(
    SELECT max(attempt.created_at) FROM notification_attempts AS attempt
    WHERE attempt.notification_id = notifications.id
  )`.mapWith((value: string | Date | null) => (value === null ? null : new Date(value))),
  lastAttemptError: sql<string | null>`(
    SELECT attempt.error FROM notification_attempts AS attempt
    WHERE attempt.notification_id = notifications.id
    ORDER BY attempt.attempt_number DESC LIMIT 1
  )`,
};

export async function getNotificationStatusRow(
  notificationId: string,
  executor: DbExecutor = db,
): Promise<NotificationStatusRow | undefined> {
  const [row] = await executor
    .select({ notification: notificationsTable, ...attemptFacts })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, notificationId));
  return row;
}

// Exact refs only (notifications_business_ref_idx), newest first.
export async function listNotificationStatusRowsByBusinessRefs(
  businessRefs: string[],
  executor: DbExecutor = db,
): Promise<NotificationStatusRow[]> {
  if (businessRefs.length === 0) return [];
  return executor
    .select({ notification: notificationsTable, ...attemptFacts })
    .from(notificationsTable)
    .where(inArray(notificationsTable.businessRef, businessRefs))
    .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id));
}

// `pending` rows whose current run (attempts at or after updated_at) has no attempt and whose run
// started more than `olderThanSeconds` ago by the database clock.
export async function listUnqueuedPendingNotifications(
  olderThanSeconds: number,
  executor: DbExecutor = db,
): Promise<SelectNotification[]> {
  return executor
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.status, "pending"),
        lt(notificationsTable.updatedAt, sql`now() - make_interval(secs => ${olderThanSeconds})`),
        sql`NOT EXISTS (
          SELECT 1 FROM notification_attempts AS attempt
          WHERE attempt.notification_id = notifications.id
            AND attempt.created_at >= notifications.updated_at
        )`,
      ),
    )
    .orderBy(asc(notificationsTable.updatedAt));
}

// ---- Attempts ----

export async function countNotificationAttempts(
  notificationId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ attemptCount: sql<number>`count(*)::int` })
    .from(notificationAttemptsTable)
    .where(eq(notificationAttemptsTable.notificationId, notificationId));
  return row?.attemptCount ?? 0;
}

export async function getLatestAttemptNumber(
  notificationId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ latest: max(notificationAttemptsTable.attemptNumber) })
    .from(notificationAttemptsTable)
    .where(eq(notificationAttemptsTable.notificationId, notificationId));
  return row?.latest ?? 0;
}

// Attempts of the current run: created at or after the notification's updated_at.
export async function listCurrentRunAttempts(
  notification: Pick<SelectNotification, "id" | "updatedAt">,
  executor: DbExecutor = db,
): Promise<SelectNotificationAttempt[]> {
  return executor
    .select()
    .from(notificationAttemptsTable)
    .where(
      and(
        eq(notificationAttemptsTable.notificationId, notification.id),
        gte(
          notificationAttemptsTable.createdAt,
          sql`(SELECT run.updated_at FROM notifications AS run WHERE run.id = ${notification.id})`,
        ),
      ),
    )
    .orderBy(asc(notificationAttemptsTable.attemptNumber));
}

// attempt_number = max + 1; callers hold the notification lock.
export async function insertNotificationAttempt(
  values: Omit<InsertNotificationAttempt, "id" | "attemptNumber" | "createdAt">,
  executor: DbExecutor = db,
): Promise<SelectNotificationAttempt> {
  const attemptNumber = (await getLatestAttemptNumber(values.notificationId, executor)) + 1;
  const insertedRows = await executor
    .insert(notificationAttemptsTable)
    .values({ ...values, attemptNumber })
    .returning();
  return firstOrThrow(insertedRows, "insertNotificationAttempt");
}

export async function findAttemptByProviderMessageId(
  providerMessageId: string,
  executor: DbExecutor = db,
): Promise<SelectNotificationAttempt | undefined> {
  const [attempt] = await executor
    .select()
    .from(notificationAttemptsTable)
    .where(eq(notificationAttemptsTable.providerMessageId, providerMessageId))
    .limit(1);
  return attempt;
}

export async function markAttemptFailed(
  attemptId: string,
  error: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .update(notificationAttemptsTable)
    .set({ status: "failed", error })
    .where(eq(notificationAttemptsTable.id, attemptId));
}

// ---- Media cache ----

export async function getCachedMedia(
  provider: NotificationProvider,
  objectKey: string,
  executor: DbExecutor = db,
): Promise<SelectNotificationMedia | undefined> {
  const [media] = await executor
    .select()
    .from(notificationMediaTable)
    .where(
      and(
        eq(notificationMediaTable.provider, provider),
        eq(notificationMediaTable.objectKey, objectKey),
      ),
    );
  return media;
}

export async function upsertCachedMedia(
  values: Omit<InsertNotificationMedia, "id">,
  executor: DbExecutor = db,
): Promise<SelectNotificationMedia> {
  const [media] = await executor
    .insert(notificationMediaTable)
    .values(values)
    .onConflictDoUpdate({
      target: [notificationMediaTable.provider, notificationMediaTable.objectKey],
      set: {
        providerMediaId: values.providerMediaId,
        filename: values.filename,
        mimeType: values.mimeType,
        uploadedAt: values.uploadedAt,
        expiresAt: values.expiresAt,
      },
    })
    .returning();
  return media!;
}

export async function deleteCachedMedia(
  provider: NotificationProvider,
  objectKey: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .delete(notificationMediaTable)
    .where(
      and(
        eq(notificationMediaTable.provider, provider),
        eq(notificationMediaTable.objectKey, objectKey),
      ),
    );
}

// Whether a higher version than `version` exists for the same provider, template and language,
// verified or not.
export async function hasHigherTemplateVersion(
  template: Pick<SelectNotificationTemplate, "provider" | "templateId" | "language" | "version">,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: notificationTemplatesTable.id })
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.provider, template.provider),
        eq(notificationTemplatesTable.templateId, template.templateId),
        eq(notificationTemplatesTable.language, template.language),
        gt(notificationTemplatesTable.version, template.version),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function checkDatabase(executor: DbExecutor = db): Promise<void> {
  await executor.execute(sql`select 1`);
}
