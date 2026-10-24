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

import { legalTypeEnum, orderStatusEnum, orderTypeEnum } from "./enums";
import { customersTable } from "./customer";
import { gatepassesTable } from "./gatepass";
import { profilesTable } from "./profile";
import { routesTable } from "./route";
import { salesmenTable } from "./salesman";

// The billed order row is the current Bill. `bill_versions` holds every version's copy.
export const ordersTable = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // `MB/{YY-YY}/{seq}`, assigned at Book Now, Pre-order place, or office Raise Bill. Never reused.
    billNumber: varchar("bill_number", { length: 16 }).notNull().unique(),

    type: orderTypeEnum("type").notNull(),

    status: orderStatusEnum("status").notNull(),

    // Who placed it. Empty only on an office Bill raised by Admin.
    salesmanId: uuid("salesman_id").references(() => salesmenTable.id),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id),

    // Book Now copies it from the GatePass. Pre-order and office Bill own it.
    routeId: uuid("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "restrict" }),

    // Originating GatePass. Book Now only.
    gatepassId: uuid("gatepass_id").references(() => gatepassesTable.id, { onDelete: "restrict" }),

    // Frozen at place. A later Route rename or state edit does not rewrite the Bill.
    routeName: varchar("route_name", { length: 120 }).notNull(),
    routeCode: varchar("route_code", { length: 64 }).notNull(),
    deliveryState: varchar("delivery_state", { length: 64 }).notNull(),

    // Seller master at issue. Settings changes do not rewrite old Bills.
    sellerSnapshot: jsonb("seller_snapshot").notNull(),

    legalType: legalTypeEnum("legal_type").notNull(),

    totalQuantity: integer("total_quantity").notNull(),

    // Tax-inclusive after round-off.
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
    roundOffPaise: bigint("round_off_paise", { mode: "number" }).notNull(),

    scheduledDate: date("scheduled_date"),

    placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),

    // Asia/Kolkata calendar day the Bill was raised: Book Now day, office Bill day, or Pre-order
    // fulfil day. Empty on an unfulfilled Pre-order. Picks the GSTR-1 month and financial year.
    billDate: date("bill_date"),

    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),

    fulfilledBy: uuid("fulfilled_by").references(() => profilesTable.id),

    idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),

    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    cancelledBy: uuid("cancelled_by").references(() => profilesTable.id),

    cancelReason: text("cancel_reason"),

    // E-invoicing. Recorded by Admin after manual portal reporting.
    irn: varchar("irn", { length: 64 }).unique(),
    irnAckNumber: varchar("irn_ack_number", { length: 64 }),
    irnAckDate: timestamp("irn_ack_date", { withTimezone: true }),
    irnSignedQr: text("irn_signed_qr"),
    irnQrImageKey: text("irn_qr_image_key"),
    irnRecordedBy: uuid("irn_recorded_by").references(() => profilesTable.id),
    irnRecordedAt: timestamp("irn_recorded_at", { withTimezone: true }),
    irnCorrectedBy: uuid("irn_corrected_by").references(() => profilesTable.id),
    irnCorrectedAt: timestamp("irn_corrected_at", { withTimezone: true }),
    irnCorrectionReason: text("irn_correction_reason"),

    // Portal cancellation, recorded before the Cancel runs.
    portalCancelAckNumber: varchar("portal_cancel_ack_number", { length: 64 }),
    portalCancelDate: date("portal_cancel_date"),
    portalCancelNotes: text("portal_cancel_notes"),

    // Bill note.
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("orders_route_id_idx").on(table.routeId),
    index("orders_gatepass_id_idx").on(table.gatepassId),
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_bill_date_idx").on(table.billDate),
    check(
      "orders_type_links_check",
      sql`(${table.type} = 'book_now' AND ${table.gatepassId} IS NOT NULL AND ${table.salesmanId} IS NOT NULL)
        OR (${table.type} = 'pre_order' AND ${table.gatepassId} IS NULL AND ${table.salesmanId} IS NOT NULL)
        OR (${table.type} = 'office_bill' AND ${table.gatepassId} IS NULL AND ${table.salesmanId} IS NULL)`,
    ),
    check(
      "orders_money_check",
      sql`${table.totalPaise} >= 0 AND ${table.taxablePaise} >= 0 AND ${table.cgstPaise} >= 0
        AND ${table.sgstPaise} >= 0 AND ${table.igstPaise} >= 0`,
    ),
    check("orders_total_quantity_check", sql`${table.totalQuantity} > 0`),
    check(
      "orders_irn_fields_check",
      sql`${table.irn} IS NULL OR (${table.irnAckNumber} IS NOT NULL AND ${table.irnAckDate} IS NOT NULL
        AND ${table.irnSignedQr} IS NOT NULL)`,
    ),
    check(
      "orders_irn_tax_invoice_check",
      sql`${table.irn} IS NULL OR ${table.legalType} = 'tax_invoice'`,
    ),
  ],
);

export type SelectOrder = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
