import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { productVarietiesTable } from "./product-variety";

// Company-wide dated GST for a variety. A period runs until the next later `effective_from`.
export const varietyTaxPeriodsTable = pgTable(
  "variety_tax_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    varietyId: uuid("variety_id")
      .notNull()
      .references(() => productVarietiesTable.id, { onDelete: "restrict" }),

    effectiveFrom: date("effective_from").notNull(),

    hsn: varchar("hsn", { length: 8 }).notNull(),

    exempt: boolean("exempt").notNull(),

    // Basis points: 5% is 500.
    gstRateBps: integer("gst_rate_bps").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("variety_tax_periods_variety_effective_from_unique").on(
      table.varietyId,
      table.effectiveFrom,
    ),
    index("variety_tax_periods_lookup_idx").on(table.varietyId, table.effectiveFrom.desc()),
    check("variety_tax_periods_hsn_check", sql`${table.hsn} ~ '^[0-9]{4,8}$'`),
    check(
      "variety_tax_periods_rate_check",
      sql`(${table.exempt} AND ${table.gstRateBps} = 0) OR (NOT ${table.exempt} AND ${table.gstRateBps} > 0)`,
    ),
  ],
);

export type SelectVarietyTaxPeriod = typeof varietyTaxPeriodsTable.$inferSelect;
export type InsertVarietyTaxPeriod = typeof varietyTaxPeriodsTable.$inferInsert;
