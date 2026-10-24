import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  date,
  timestamp,
  text,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { gatepassStatusEnum } from "./enums";
import { profilesTable } from "./profile";
import { routesTable } from "./route";
import { salesmenTable } from "./salesman";

export const gatepassesTable = pgTable(
  "gatepasses",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    salesmanId: uuid("salesman_id")
      .notNull()
      .references(() => salesmenTable.id),

    // Set at allotment. Never edited.
    routeId: uuid("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "restrict" }),

    businessDate: date("business_date").notNull(),

    status: gatepassStatusEnum("status").notNull().default("not_issued"),

    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => profilesTable.id),

    closedBy: uuid("closed_by").references(() => profilesTable.id),

    closedAt: timestamp("closed_at", { withTimezone: true }),

    hasDiscrepancy: boolean("has_discrepancy").notNull().default(false),

    discrepancyReason: text("discrepancy_reason"),

    handoverSubmittedAt: timestamp("handover_submitted_at", { withTimezone: true }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // A salesman may hold multiple gatepasses on the same business date (e.g. hand over the
    // first, then get re-allotted a fresh one), but only ONE may be `active` at any time so
    // that book-now and handover always resolve to a single, unambiguous gatepass.
    uniqueIndex("gatepasses_salesman_active_business_date_unique")
      .on(table.salesmanId, table.businessDate)
      .where(sql`${table.status} = 'active'`),
    index("gatepasses_route_id_idx").on(table.routeId),
  ],
);

export type SelectGatepass = typeof gatepassesTable.$inferSelect;
export type InsertGatepass = typeof gatepassesTable.$inferInsert;
