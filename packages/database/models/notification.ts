import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  notificationAttemptStatusEnum,
  notificationKindEnum,
  notificationStatusEnum,
} from "./enums";

// WhatsApp transport store (ADR-0001). Domain commit never waits on delivery. No FK to Bills /
// Payments / Notes (db-decisions/0013).
export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    kind: notificationKindEnum("kind").notNull(),

    status: notificationStatusEnum("status").notNull().default("pending"),

    // Opaque Bill / Payment / Note id (and version if needed); no FK.
    businessRef: varchar("business_ref", { length: 128 }).notNull(),

    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),

    recipientPhone: varchar("recipient_phone", { length: 20 }),

    bodyText: text("body_text").notNull(),

    // Bill / GST Note PDF; null on receipt, account_update, cancellation.
    attachmentUrl: text("attachment_url"),

    skipReason: text("skip_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("notifications_business_ref_idx").on(table.businessRef)],
);

// Inngest attempts under a notification. Provider payloads stay in this table.
export const notificationAttemptsTable = pgTable(
  "notification_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),

    attemptNumber: integer("attempt_number").notNull(),

    status: notificationAttemptStatusEnum("status").notNull(),

    provider: varchar("provider", { length: 40 }),

    providerMessageId: varchar("provider_message_id", { length: 128 }),

    error: text("error"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_attempts_unique").on(table.notificationId, table.attemptNumber),
  ],
);

export type SelectNotification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
export type SelectNotificationAttempt = typeof notificationAttemptsTable.$inferSelect;
export type InsertNotificationAttempt = typeof notificationAttemptsTable.$inferInsert;
