import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { citiesTable } from "./city";
import { entityStatusEnum, messageLanguageEnum } from "./enums";
import { profilesTable } from "./profile";
import { routesTable } from "./route";

// One outlet on exactly one Route. One running Balance with Motake. Same phone may appear on
// more than one Customer.
export const customersTable = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    shopName: varchar("shop_name", { length: 200 }).notNull(),

    contactName: varchar("contact_name", { length: 120 }),

    // No longer unique.
    phone: varchar("phone", { length: 20 }).notNull(),

    address: text("address").notNull(),

    notes: text("notes"),

    shopPhotoKey: text("shop_photo_key"),

    shopPhotoUrl: text("shop_photo_url"),

    // Live FK; Admin may move after open Pre-orders close.
    routeId: uuid("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "restrict" }),

    // Required by the Admin and salesman Customer forms; null only on Customers added before
    // cities existed, until an Admin edit sets it.
    cityId: uuid("city_id").references(() => citiesTable.id, { onDelete: "restrict" }),

    // Empty = normal Customer; 15 characters when present.
    gstin: varchar("gstin", { length: 15 }),

    einvoicingRequired: boolean("einvoicing_required").notNull(),

    // Language of WhatsApp messages; Documents are always English.
    preferredLanguage: messageLanguageEnum("preferred_language").notNull().default("mr"),

    // Signed copy of Debits − Credits; > 0 Pending, < 0 Advance. Updated in the same
    // transaction as each Ledger insert.
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
    index("customers_city_id_idx").on(table.cityId),
  ],
);

export type SelectCustomer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
