import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";
import { profilesTable } from "./profile";
import { routesTable } from "./route";

export const customersTable = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    shopName: varchar("shop_name", { length: 200 }).notNull(),

    contactName: varchar("contact_name", { length: 120 }),

    // Not unique: the same phone may appear on more than one Customer.
    phone: varchar("phone", { length: 20 }).notNull(),

    address: text("address").notNull(),

    notes: text("notes"),

    shopPhotoKey: text("shop_photo_key"),

    shopPhotoUrl: text("shop_photo_url"),

    routeId: uuid("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "restrict" }),

    // Empty = normal Customer.
    gstin: varchar("gstin", { length: 15 }),

    einvoicingRequired: boolean("einvoicing_required").notNull(),

    // Debits minus Credits, kept in step with each Ledger row. Above 0 = Pending, below 0 = Advance.
    balancePaise: bigint("balance_paise", { mode: "number" }).notNull().default(0),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => profilesTable.id),

    status: entityStatusEnum("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("customers_route_id_idx").on(table.routeId),
    check(
      "customers_gstin_check",
      sql`${table.gstin} IS NULL OR char_length(${table.gstin}) = 15`,
    ),
  ],
);

export type SelectCustomer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
