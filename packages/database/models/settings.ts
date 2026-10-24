import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { documentSeriesEnum } from "./enums";
import { profilesTable } from "./profile";

// One org seller row. Bills and Notes snapshot it at issue. Edits are written to `audit_logs`.
export const sellerSettingsTable = pgTable(
  "seller_settings",
  {
    id: smallint("id").primaryKey().default(1),

    legalName: varchar("legal_name", { length: 200 }).notNull(),

    address: text("address").notNull(),

    gstin: varchar("gstin", { length: 15 }).notNull(),

    phone: varchar("phone", { length: 20 }).notNull(),

    email: varchar("email", { length: 255 }).notNull(),

    state: varchar("state", { length: 64 }).notNull(),

    updatedBy: uuid("updated_by").references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("seller_settings_singleton_check", sql`${table.id} = 1`),
    check("seller_settings_gstin_check", sql`char_length(${table.gstin}) = 15`),
  ],
);

// One row per Indian financial year (1 Apr – 31 Mar), labelled `YY-YY`.
export const financialYearsTable = pgTable(
  "financial_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    label: varchar("label", { length: 5 }).notNull().unique(),

    startsOn: date("starts_on").notNull().unique(),

    endsOn: date("ends_on").notNull(),

    // Configurable until that series' first number this year; then frozen until next year.
    billPrefix: varchar("bill_prefix", { length: 6 }).notNull().default("MB"),
    creditNotePrefix: varchar("credit_note_prefix", { length: 6 }).notNull().default("MC"),
    debitNotePrefix: varchar("debit_note_prefix", { length: 6 }).notNull().default("MD"),
    paymentPrefix: varchar("payment_prefix", { length: 6 }).notNull().default("MP"),
    refundPrefix: varchar("refund_prefix", { length: 6 }).notNull().default("MR"),

    // Default 30 Nov after the year ends. Changes are written to `audit_logs`.
    gstCreditNoteDeadline: date("gst_credit_note_deadline").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("financial_years_label_check", sql`${table.label} ~ '^[0-9]{2}-[0-9]{2}$'`),
    check(
      "financial_years_dates_check",
      sql`extract(month from ${table.startsOn}) = 4 AND extract(day from ${table.startsOn}) = 1
        AND ${table.endsOn} = (${table.startsOn} + interval '1 year' - interval '1 day')::date`,
    ),
    // `{prefix}/{YY-YY}/{000001}` must fit in 16 characters: prefix at most 3.
    check(
      "financial_years_prefix_length_check",
      sql`char_length(${table.billPrefix}) BETWEEN 1 AND 3
        AND char_length(${table.creditNotePrefix}) BETWEEN 1 AND 3
        AND char_length(${table.debitNotePrefix}) BETWEEN 1 AND 3
        AND char_length(${table.paymentPrefix}) BETWEEN 1 AND 3
        AND char_length(${table.refundPrefix}) BETWEEN 1 AND 3`,
    ),
  ],
);

// Last sequence used per series per financial year. A series' prefix is locked once `last_seq > 0`.
export const documentSequencesTable = pgTable(
  "document_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    financialYearId: uuid("financial_year_id")
      .notNull()
      .references(() => financialYearsTable.id, { onDelete: "restrict" }),

    series: documentSeriesEnum("series").notNull(),

    lastSeq: integer("last_seq").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_sequences_year_series_unique").on(table.financialYearId, table.series),
    check(
      "document_sequences_last_seq_check",
      sql`${table.lastSeq} >= 0 AND ${table.lastSeq} <= 999999`,
    ),
  ],
);

// Org-wide GSTR-1 filing per calendar month. The month lock is derived from this row + Bill date.
export const gstr1FilingsTable = pgTable(
  "gstr1_filings",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // `YYYY-MM`.
    month: varchar("month", { length: 7 }).notNull().unique(),

    filingDate: date("filing_date").notNull(),

    reference: varchar("reference", { length: 120 }).notNull(),

    notes: text("notes"),

    filedBy: uuid("filed_by")
      .notNull()
      .references(() => profilesTable.id),

    correctedBy: uuid("corrected_by").references(() => profilesTable.id),

    correctedAt: timestamp("corrected_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check("gstr1_filings_month_check", sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check(
      "gstr1_filings_filing_date_check",
      sql`${table.filingDate} >= to_date(${table.month} || '-01', 'YYYY-MM-DD')`,
    ),
  ],
);

export type SelectSellerSettings = typeof sellerSettingsTable.$inferSelect;
export type InsertSellerSettings = typeof sellerSettingsTable.$inferInsert;
export type SelectFinancialYear = typeof financialYearsTable.$inferSelect;
export type InsertFinancialYear = typeof financialYearsTable.$inferInsert;
export type SelectDocumentSequence = typeof documentSequencesTable.$inferSelect;
export type InsertDocumentSequence = typeof documentSequencesTable.$inferInsert;
export type SelectGstr1Filing = typeof gstr1FilingsTable.$inferSelect;
export type InsertGstr1Filing = typeof gstr1FilingsTable.$inferInsert;
