import { sql } from "drizzle-orm";
import { bigint, check, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { productVarietiesTable } from "./product-variety";
import { routesTable } from "./route";

// One current tax-exclusive price per Route and variety. No row = unsellable on that Route.
export const routePricesTable = pgTable(
  "route_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    routeId: uuid("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "restrict" }),

    varietyId: uuid("variety_id")
      .notNull()
      .references(() => productVarietiesTable.id, { onDelete: "restrict" }),

    pricePaise: bigint("price_paise", { mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("route_prices_route_variety_unique").on(table.routeId, table.varietyId),
    check("route_prices_price_paise_check", sql`${table.pricePaise} > 0`),
  ],
);

export type SelectRoutePrice = typeof routePricesTable.$inferSelect;
export type InsertRoutePrice = typeof routePricesTable.$inferInsert;
