import { sql } from "drizzle-orm";
import {
  boolean,
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

import {
  attachmentTypeEnum,
  messageLanguageEnum,
  notificationAttemptStatusEnum,
  notificationKindEnum,
  notificationProviderEnum,
  notificationStatusEnum,
  templateDocumentTypeEnum,
} from "./enums";

// Provider-approved message shapes (db-decisions/0014). Inserted by hand in the database; the app
// only reads. Never edited except `verified`; a change is a new version. A message uses the highest
// version for its provider, template and language, and is refused if that version is not verified.
export const notificationTemplatesTable = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: notificationProviderEnum("provider").notNull(),

    // The provider's own template name.
    templateId: varchar("template_id", { length: 128 }).notNull(),

    language: messageLanguageEnum("language").notNull(),

    // 1, 2, 3 ...
    version: integer("version").notNull(),

    // Ordered blank names, e.g. ["shop_name", "bill_number"]; values are sent in this order.
    templateVariables: jsonb("template_variables").$type<string[]>().notNull(),

    documentType: templateDocumentTypeEnum("document_type").notNull().default("none"),

    verified: boolean("verified").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_templates_version_unique").on(
      table.provider,
      table.templateId,
      table.language,
      table.version,
    ),
    check("notification_templates_version_check", sql`${table.version} >= 1`),
    check(
      "notification_templates_variables_check",
      sql`jsonb_typeof(${table.templateVariables}) = 'array'`,
    ),
  ],
);

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

    // The exact template version used.
    notificationTemplateId: uuid("notification_template_id")
      .notNull()
      .references(() => notificationTemplatesTable.id, { onDelete: "restrict" }),

    // Values by blank name; matches the template's variables exactly.
    templateValues: jsonb("template_values").$type<Record<string, string>>().notNull(),

    // Unused for now; no free text is ever sent.
    bodyText: text("body_text"),

    // Private R2 key of the Document; null when the template carries none.
    attachmentKey: text("attachment_key"),

    attachmentType: attachmentTypeEnum("attachment_type"),

    // e.g. `Motake Bill MB-26-27-000123.pdf`.
    attachmentFilename: varchar("attachment_filename", { length: 255 }),

    skipReason: text("skip_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notifications_business_ref_idx").on(table.businessRef),
    index("notifications_template_id_idx").on(table.notificationTemplateId),
    check(
      "notifications_template_values_check",
      sql`jsonb_typeof(${table.templateValues}) = 'object'`,
    ),
    check(
      "notifications_attachment_check",
      sql`(${table.attachmentKey} IS NULL AND ${table.attachmentType} IS NULL AND ${table.attachmentFilename} IS NULL) OR (${table.attachmentKey} IS NOT NULL AND ${table.attachmentType} IS NOT NULL AND ${table.attachmentFilename} IS NOT NULL)`,
    ),
  ],
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

// Provider media id per uploaded Document, reused until a day before the provider's expiry
// (WhatsApp: 30 days), then uploaded again.
export const notificationMediaTable = pgTable(
  "notification_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    provider: notificationProviderEnum("provider").notNull(),

    // Private R2 key.
    objectKey: text("object_key").notNull(),

    providerMediaId: varchar("provider_media_id", { length: 128 }).notNull(),

    filename: varchar("filename", { length: 255 }).notNull(),

    mimeType: varchar("mime_type", { length: 100 }).notNull(),

    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("notification_media_provider_object_unique").on(table.provider, table.objectKey),
  ],
);

export type SelectNotificationTemplate = typeof notificationTemplatesTable.$inferSelect;
export type InsertNotificationTemplate = typeof notificationTemplatesTable.$inferInsert;
export type SelectNotification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
export type SelectNotificationAttempt = typeof notificationAttemptsTable.$inferSelect;
export type InsertNotificationAttempt = typeof notificationAttemptsTable.$inferInsert;
export type SelectNotificationMedia = typeof notificationMediaTable.$inferSelect;
export type InsertNotificationMedia = typeof notificationMediaTable.$inferInsert;
