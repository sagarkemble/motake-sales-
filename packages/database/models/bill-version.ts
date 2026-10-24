import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { legalTypeEnum } from "./enums";
import { ordersTable } from "./order";
import { productVarietiesTable } from "./product-variety";
import { profilesTable } from "./profile";

// Bill history: a full copy of the Bill at each version, including the first (reason Raised).
export const billVersionsTable = pgTable(
  "bill_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),

    versionNumber: integer("version_number").notNull(),

    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
    roundOffPaise: bigint("round_off_paise", { mode: "number" }).notNull(),

    legalType: legalTypeEnum("legal_type").notNull(),

    placeOfSupplyState: varchar("place_of_supply_state", { length: 64 }).notNull(),

    // Bill note text at this version.
    notes: text("notes"),

    reason: text("reason").notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("bill_versions_order_version_unique").on(table.orderId, table.versionNumber),
    check("bill_versions_version_number_check", sql`${table.versionNumber} >= 1`),
    check(
      "bill_versions_money_check",
      sql`${table.totalPaise} >= 0 AND ${table.taxablePaise} >= 0 AND ${table.cgstPaise} >= 0
        AND ${table.sgstPaise} >= 0 AND ${table.igstPaise} >= 0`,
    ),
  ],
);

export const billVersionLinesTable = pgTable(
  "bill_version_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    billVersionId: uuid("bill_version_id")
      .notNull()
      .references(() => billVersionsTable.id, { onDelete: "restrict" }),

    varietyId: uuid("variety_id")
      .notNull()
      .references(() => productVarietiesTable.id),

    varietyName: varchar("variety_name", { length: 120 }).notNull(),

    unit: varchar("unit", { length: 32 }).notNull(),

    quantity: integer("quantity").notNull(),

    routePricePaise: bigint("route_price_paise", { mode: "number" }).notNull(),

    hsn: varchar("hsn", { length: 8 }).notNull(),

    exempt: boolean("exempt").notNull(),

    gstRateBps: integer("gst_rate_bps").notNull(),

    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
  },
  (table) => [
    index("bill_version_lines_bill_version_id_idx").on(table.billVersionId),
    check("bill_version_lines_quantity_check", sql`${table.quantity} > 0`),
    check("bill_version_lines_route_price_paise_check", sql`${table.routePricePaise} > 0`),
    check("bill_version_lines_hsn_check", sql`${table.hsn} ~ '^[0-9]{4,8}$'`),
    check(
      "bill_version_lines_rate_check",
      sql`(${table.exempt} AND ${table.gstRateBps} = 0) OR (NOT ${table.exempt} AND ${table.gstRateBps} > 0)`,
    ),
    check(
      "bill_version_lines_money_check",
      sql`${table.taxablePaise} >= 0 AND ${table.cgstPaise} >= 0 AND ${table.sgstPaise} >= 0
        AND ${table.igstPaise} >= 0`,
    ),
  ],
);

export type SelectBillVersion = typeof billVersionsTable.$inferSelect;
export type InsertBillVersion = typeof billVersionsTable.$inferInsert;
export type SelectBillVersionLine = typeof billVersionLinesTable.$inferSelect;
export type InsertBillVersionLine = typeof billVersionLinesTable.$inferInsert;
