import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { notificationKindEnum, notificationStatusEnum } from "./enums";

// Owned by the notification service (ADR-0001). Persisted before the delegate is acknowledged.
export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Caller-supplied. A retried delegate with the same key returns this row.
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull().unique(),

    kind: notificationKindEnum("kind").notNull(),

    // Normalized `+91…` snapshot. Empty or bad → `skipped`.
    recipient: varchar("recipient", { length: 20 }),

    // Rendered text; or template name, language, parameters; or document URL + caption.
    content: jsonb("content").notNull(),

    // Opaque links (customer, Bill / Payment / Note, version) for history only.
    businessRef: jsonb("business_ref").notNull(),

    status: notificationStatusEnum("status").notNull().default("pending"),

    lastError: text("last_error"),

    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).defaultNow().notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("notifications_status_idx").on(table.status)],
);

// One row per send attempt, including manual resends. Provider ids stay inside the service.
export const notificationAttemptsTable = pgTable(
  "notification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),

    attemptNumber: integer("attempt_number").notNull(),

    // Meta `wamid` once accepted. Webhook statuses reconcile on it.
    providerMessageId: varchar("provider_message_id", { length: 200 }),

    // Meta media id when the document was uploaded rather than linked.
    providerMediaId: varchar("provider_media_id", { length: 200 }),

    errorCode: varchar("error_code", { length: 64 }),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_attempts_notification_attempt_unique").on(
      table.notificationId,
      table.attemptNumber,
    ),
    uniqueIndex("notification_attempts_provider_message_id_unique")
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} IS NOT NULL`),
    check("notification_attempts_attempt_number_check", sql`${table.attemptNumber} >= 1`),
  ],
);

// Dedupes provider webhook retries.
export const notificationWebhookEventsTable = pgTable("notification_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),

  providerEventKey: varchar("provider_event_key", { length: 300 }).notNull().unique(),

  payload: jsonb("payload").notNull(),

  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SelectNotification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
export type SelectNotificationAttempt = typeof notificationAttemptsTable.$inferSelect;
export type InsertNotificationAttempt = typeof notificationAttemptsTable.$inferInsert;
export type SelectNotificationWebhookEvent = typeof notificationWebhookEventsTable.$inferSelect;
export type InsertNotificationWebhookEvent = typeof notificationWebhookEventsTable.$inferInsert;
