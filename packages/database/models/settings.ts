import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { documentKindEnum } from "./enums";
import { profilesTable } from "./profile";

// Single-row statutory seller master. Printed snapshots live on each Bill and Note; later edits
// do not rewrite old papers. History of edits is audit_logs, not a version table.
export const sellerSettingsTable = pgTable("seller_settings", {
  id: uuid("id").primaryKey().defaultRandom(),

  legalName: varchar("legal_name", { length: 200 }).notNull(),

  address: text("address").notNull(),

  // Seller place of supply.
  state: varchar("state", { length: 120 }).notNull(),

  gstin: varchar("gstin", { length: 15 }).notNull(),

  phone: varchar("phone", { length: 20 }).notNull(),

  email: varchar("email", { length: 255 }),

  einvoicingRequired: boolean("einvoicing_required").notNull().default(true),

  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => profilesTable.id),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
});

// One row per (financial year, document kind). Prefix is frozen after the first document of that
// series that FY. Sequence is allocated in the same transaction as the document.
// Format `{prefix}/{YY-YY}/{seq}`, max 16 chars. GST and Commercial Credit Notes share credit_note.
export const documentNumberSeriesTable = pgTable(
  "document_number_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // `YY-YY`, e.g. 26-27.
    financialYear: varchar("financial_year", { length: 5 }).notNull(),

    kind: documentKindEnum("kind").notNull(),

    // MB MC MD MP MR.
    prefix: varchar("prefix", { length: 2 }).notNull(),

    // Next unused seq; lock the row.
    nextSeq: integer("next_seq").notNull(),

    // Null until first issue; then prefix frozen.
    firstUsedAt: timestamp("first_used_at", { withTimezone: true }),

    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => profilesTable.id),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_number_series_fy_kind_unique").on(table.financialYear, table.kind),
  ],
);

// One GST Credit Note deadline per financial year. Default until configured: 30 November after
// the Bill FY end, or the annual-return date if earlier.
export const gstCreditNoteDeadlinesTable = pgTable(
  "gst_credit_note_deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    financialYear: varchar("financial_year", { length: 5 }).notNull(),

    deadlineDate: date("deadline_date").notNull(),

    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("gst_credit_note_deadlines_fy_unique").on(table.financialYear)],
);

// Admin records the externally completed monthly GSTR-1. Presence of a row for month(bill_date)
// locks Line Correct. Correct filing updates this row; does not unlock.
export const gstr1FilingsTable = pgTable(
  "gstr1_filings",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // First day of the filing month IST.
    periodMonth: date("period_month").notNull(),

    filedOn: date("filed_on").notNull(),

    // Acknowledgement.
    reference: varchar("reference", { length: 128 }).notNull(),

    filerId: uuid("filer_id")
      .notNull()
      .references(() => profilesTable.id),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("gstr1_filings_period_month_unique").on(table.periodMonth)],
);

export type SelectSellerSettings = typeof sellerSettingsTable.$inferSelect;
export type InsertSellerSettings = typeof sellerSettingsTable.$inferInsert;
export type SelectDocumentNumberSeries = typeof documentNumberSeriesTable.$inferSelect;
export type InsertDocumentNumberSeries = typeof documentNumberSeriesTable.$inferInsert;
export type SelectGstCreditNoteDeadline = typeof gstCreditNoteDeadlinesTable.$inferSelect;
export type InsertGstCreditNoteDeadline = typeof gstCreditNoteDeadlinesTable.$inferInsert;
export type SelectGstr1Filing = typeof gstr1FilingsTable.$inferSelect;
export type InsertGstr1Filing = typeof gstr1FilingsTable.$inferInsert;
