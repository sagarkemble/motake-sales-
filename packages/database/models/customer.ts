import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, timestamp, text, uniqueIndex } from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";
import { profilesTable } from "./profile";

export const customersTable = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    shopName: varchar("shop_name", { length: 200 }).notNull(),

    contactName: varchar("contact_name", { length: 120 }),

    phone: varchar("phone", { length: 20 }).notNull(),

    address: text("address").notNull(),

    notes: text("notes"),

    shopPhotoKey: text("shop_photo_key"),

    shopPhotoUrl: text("shop_photo_url"),

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
    uniqueIndex("customers_phone_active_unique")
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type SelectCustomer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
