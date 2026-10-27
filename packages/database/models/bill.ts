import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
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

import { legalTypeEnum } from "./enums";
import { orderItemsTable } from "./order-item";
import { ordersTable } from "./order";
import { productVarietiesTable } from "./product-variety";
import { profilesTable } from "./profile";

// The current money paper. Book Now issues it at place; Pre-order at fulfil. Correct rewrites
// this row and bill_items; history is bill_versions (db-decisions/0004, 0005).
// Month lock is derived from gstr1_filings + bill_date. No filed flag on the Bill.
export const billsTable = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Null when Admin Raises Bill with no sale.
    orderId: uuid("order_id").references(() => ordersTable.id, { onDelete: "restrict" }),

    // `MB/{YY-YY}/{seq}`; assigned when the paper is issued.
    number: varchar("number", { length: 16 }).notNull(),

    legalType: legalTypeEnum("legal_type").notNull(),

    // Frozen stamps: route {name, code, delivery_state}, buyer {shop_name, phone, address, gstin},
    // seller {legal_name, address, gstin}.
    letterhead: jsonb("letterhead").notNull(),

    totalQuantity: integer("total_quantity").notNull(),

    // Tax-inclusive after round-off.
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
    // Signed.
    roundOffPaise: bigint("round_off_paise", { mode: "number" }).notNull(),

    // Book Now = place day; Pre-order = fulfil day; GSTR-1 lock uses this.
    billDate: date("bill_date").notNull(),

    irn: text("irn").unique(),
    irnAckNumber: varchar("irn_ack_number", { length: 64 }),
    irnAckDate: date("irn_ack_date"),
    signedQrText: text("signed_qr_text"),
    // Private R2 key of the uploaded signed QR image (db-decisions/0014).
    signedQrImageKey: text("signed_qr_image_key"),
    irnRecordedAt: timestamp("irn_recorded_at", { withTimezone: true }),
    irnRecordedBy: uuid("irn_recorded_by").references(() => profilesTable.id),
    irnCorrectReason: text("irn_correct_reason"),
    portalCancelAckNumber: varchar("portal_cancel_ack_number", { length: 64 }),
    portalCancelAckDate: date("portal_cancel_ack_date"),
    portalCancelNotes: text("portal_cancel_notes"),

    // Raise Bill's client key (db-decisions/0015); null on a checkout Bill, whose key is on its order.
    idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bills_order_id_idx").on(table.orderId),
    uniqueIndex("bills_order_id_unique")
      .on(table.orderId)
      .where(sql`${table.orderId} IS NOT NULL`),
    uniqueIndex("bills_number_unique").on(table.number),
    check("bills_total_paise_check", sql`${table.totalPaise} >= 0`),
  ],
);

// What shipped on the current Bill. Correct rewrites these rows. History is
// bill_versions.header + items (db-decisions/0006).
export const billItemsTable = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    billId: uuid("bill_id")
      .notNull()
      .references(() => billsTable.id, { onDelete: "cascade" }),

    varietyId: uuid("variety_id")
      .notNull()
      .references(() => productVarietiesTable.id, { onDelete: "restrict" }),

    // Sale line this shipment came from; null on Admin Raise Bill.
    orderItemId: uuid("order_item_id").references(() => orderItemsTable.id, {
      onDelete: "restrict",
    }),

    // Frozen Variety {name, unit} + tax print {hsn}.
    stamp: jsonb("stamp").notNull(),

    // Qty shipped.
    quantity: integer("quantity").notNull(),

    // Tax-exclusive; copied from the order lock or snapshotted at Raise Bill.
    routePricePaise: bigint("route_price_paise", { mode: "number" }).notNull(),

    exempt: boolean("exempt").notNull(),

    // 5% is 500.
    gstRateBps: integer("gst_rate_bps").notNull(),

    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bill_items_bill_variety_unique").on(table.billId, table.varietyId),
    check("bill_items_quantity_check", sql`${table.quantity} > 0`),
    check("bill_items_route_price_paise_check", sql`${table.routePricePaise} > 0`),
    check(
      "bill_items_exempt_rate_check",
      sql`(${table.exempt} AND ${table.gstRateBps} = 0) OR (NOT ${table.exempt} AND ${table.gstRateBps} > 0)`,
    ),
  ],
);

export type SelectBill = typeof billsTable.$inferSelect;
export type InsertBill = typeof billsTable.$inferInsert;
export type SelectBillItem = typeof billItemsTable.$inferSelect;
export type InsertBillItem = typeof billItemsTable.$inferInsert;
