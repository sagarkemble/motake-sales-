import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { billVersionLinesTable } from "./bill-version";
import { noteKindEnum } from "./enums";
import { ordersTable } from "./order";
import { profilesTable } from "./profile";

// Credit Note or Debit Note on a Bill. Its one Ledger row points back via `ledger_entries.note_id`.
export const notesTable = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    kind: noteKindEnum("kind").notNull(),

    // `MC/...` (GST and Commercial share it) or `MD/...`. Never reused.
    number: varchar("number", { length: 16 }).notNull().unique(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),

    issuedOn: date("issued_on").notNull(),

    reason: text("reason").notNull(),

    returnOrDamageOn: date("return_or_damage_on"),

    // Positive customer effect.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),

    sellerSnapshot: jsonb("seller_snapshot").notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notes_order_id_idx").on(table.orderId),
    check("notes_amount_paise_check", sql`${table.amountPaise} > 0`),
    check(
      "notes_tax_check",
      sql`${table.cgstPaise} >= 0 AND ${table.sgstPaise} >= 0 AND ${table.igstPaise} >= 0`,
    ),
    check(
      "notes_commercial_no_tax_check",
      sql`${table.kind} <> 'commercial_credit_note'
        OR (${table.cgstPaise} = 0 AND ${table.sgstPaise} = 0 AND ${table.igstPaise} = 0)`,
    ),
  ],
);

// Points at the Bill version line current when the Note was raised. Remaining uncredited
// quantity is derived from prior lines, never a mutable counter.
export const noteLinesTable = pgTable(
  "note_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    noteId: uuid("note_id")
      .notNull()
      .references(() => notesTable.id, { onDelete: "restrict" }),

    billVersionLineId: uuid("bill_version_line_id")
      .notNull()
      .references(() => billVersionLinesTable.id, { onDelete: "restrict" }),

    quantity: integer("quantity").notNull(),

    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
  },
  (table) => [
    index("note_lines_note_id_idx").on(table.noteId),
    index("note_lines_bill_version_line_id_idx").on(table.billVersionLineId),
    check("note_lines_quantity_check", sql`${table.quantity} > 0`),
    check(
      "note_lines_money_check",
      sql`${table.amountPaise} >= 0 AND ${table.taxablePaise} >= 0 AND ${table.cgstPaise} >= 0
        AND ${table.sgstPaise} >= 0 AND ${table.igstPaise} >= 0`,
    ),
  ],
);

export type SelectNote = typeof notesTable.$inferSelect;
export type InsertNote = typeof notesTable.$inferInsert;
export type SelectNoteLine = typeof noteLinesTable.$inferSelect;
export type InsertNoteLine = typeof noteLinesTable.$inferInsert;
