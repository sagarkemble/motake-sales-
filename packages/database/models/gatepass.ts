import {
  pgTable,
  uuid,
  date,
  timestamp,
  text,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { gatepassStatusEnum } from "./enums";
import { profilesTable } from "./profile";
import { salesmenTable } from "./salesman";

export const gatepassesTable = pgTable(
  "gatepasses",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    salesmanId: uuid("salesman_id")
      .notNull()
      .references(() => salesmenTable.id),

    businessDate: date("business_date").notNull(),

    status: gatepassStatusEnum("status").notNull().default("not_issued"),

    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => profilesTable.id),

    closedBy: uuid("closed_by").references(() => profilesTable.id),

    closedAt: timestamp("closed_at", { withTimezone: true }),

    hasDiscrepancy: boolean("has_discrepancy").notNull().default(false),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("gatepasses_salesman_business_date_unique").on(
      table.salesmanId,
      table.businessDate
    ),
  ]
);

export type SelectGatepass = typeof gatepassesTable.$inferSelect;
export type InsertGatepass = typeof gatepassesTable.$inferInsert;
