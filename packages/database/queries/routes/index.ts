import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  gatepassesTable,
  ordersTable,
  productVarietiesTable,
  productsTable,
  routePricesTable,
  routesTable,
  type InsertRoute,
  type SelectRoute,
  type SelectRoutePrice,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

// Fixed key for the transaction-scoped advisory lock that serialises Route create and rename, so
// the case-insensitive name check and the global code counter never race.
const ROUTE_NAMING_LOCK_KEY = 4_401_302;

const OPEN_PRE_ORDER_STATUSES = ["scheduled", "due"] as const;

export interface RouteListRow {
  id: string;
  name: string;
  code: string;
  deliveryState: string;
  status: SelectRoute["status"];
  hidden: boolean;
  pricedVarietyCount: number;
}

export interface RouteChoice {
  id: string;
  name: string;
  code: string;
  status: SelectRoute["status"];
}

export interface RoutePriceFormRow {
  varietyId: string;
  productName: string;
  varietyName: string;
  sku: string;
  unit: string;
  varietyActive: boolean;
  pricePaise: number | null;
  pricedOnAnyRoute: boolean;
}

export async function lockRouteNaming(executor: DbExecutor = db): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(${ROUTE_NAMING_LOCK_KEY})`);
}

// Another Route whose name matches in any letter case, hidden or not.
export async function findRouteByNameIgnoringCase(
  name: string,
  excludeRouteId: string | undefined,
  executor: DbExecutor = db,
): Promise<SelectRoute | undefined> {
  const [route] = await executor
    .select()
    .from(routesTable)
    .where(
      and(
        sql`lower(${routesTable.name}) = lower(${name})`,
        excludeRouteId ? ne(routesTable.id, excludeRouteId) : undefined,
      ),
    )
    .limit(1);
  return route;
}

export async function listRouteCodes(executor: DbExecutor = db): Promise<string[]> {
  const rows = await executor.select({ code: routesTable.code }).from(routesTable);
  return rows.map((row) => row.code);
}

export async function createRoute(
  newRoute: InsertRoute,
  executor: DbExecutor = db,
): Promise<SelectRoute> {
  const insertedRows = await executor.insert(routesTable).values(newRoute).returning();
  return firstOrThrow(insertedRows, "createRoute");
}

export async function getRouteById(
  routeId: string,
  executor: DbExecutor = db,
): Promise<SelectRoute | undefined> {
  const [route] = await executor.select().from(routesTable).where(eq(routesTable.id, routeId));
  return route;
}

// `update` for Hide; `share` for writes that must not race a Hide (GatePass allot).
export async function lockRouteRow(
  routeId: string,
  strength: "update" | "share",
  executor: DbExecutor = db,
): Promise<SelectRoute | undefined> {
  const [route] = await executor
    .select()
    .from(routesTable)
    .where(eq(routesTable.id, routeId))
    .for(strength);
  return route;
}

export async function updateRoute(
  routeId: string,
  changes: Partial<Pick<InsertRoute, "name" | "deliveryState" | "status" | "deletedAt">>,
  executor: DbExecutor = db,
): Promise<SelectRoute | undefined> {
  const [route] = await executor
    .update(routesTable)
    .set(changes)
    .where(eq(routesTable.id, routeId))
    .returning();
  return route;
}

export async function listRoutes(
  filters: { search?: string; includeHidden: boolean },
  executor: DbExecutor = db,
): Promise<RouteListRow[]> {
  const searchClause = filters.search
    ? or(
        ilike(routesTable.name, `%${filters.search}%`),
        ilike(routesTable.code, `%${filters.search}%`),
        ilike(routesTable.deliveryState, `%${filters.search}%`),
      )
    : undefined;
  return executor
    .select({
      id: routesTable.id,
      name: routesTable.name,
      code: routesTable.code,
      deliveryState: routesTable.deliveryState,
      status: routesTable.status,
      hidden: sql<boolean>`${routesTable.deletedAt} IS NOT NULL`,
      // Raw qualified names: inside a subquery Drizzle leaves column names unqualified.
      pricedVarietyCount: sql<number>`(
        SELECT count(*)::int FROM route_prices WHERE route_prices.route_id = routes.id
      )`,
    })
    .from(routesTable)
    .where(and(filters.includeHidden ? undefined : isNull(routesTable.deletedAt), searchClause))
    .orderBy(asc(routesTable.name));
}

// Listed (not hidden) Routes, Active and Inactive, for the Route pickers.
export async function listRouteChoices(
  excludeRouteId: string | undefined,
  executor: DbExecutor = db,
): Promise<RouteChoice[]> {
  return executor
    .select({
      id: routesTable.id,
      name: routesTable.name,
      code: routesTable.code,
      status: routesTable.status,
    })
    .from(routesTable)
    .where(
      and(
        isNull(routesTable.deletedAt),
        excludeRouteId ? ne(routesTable.id, excludeRouteId) : undefined,
      ),
    )
    .orderBy(asc(routesTable.name));
}

// Active GatePasses on the Route, any business date.
export async function countActiveGatepassesOnRoute(
  routeId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(gatepassesTable)
    .where(and(eq(gatepassesTable.routeId, routeId), eq(gatepassesTable.status, "active")));
  return row?.total ?? 0;
}

export async function countOpenPreordersOnRoute(
  routeId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.routeId, routeId),
        eq(ordersTable.type, "pre_order"),
        inArray(ordersTable.status, [...OPEN_PRE_ORDER_STATUSES]),
      ),
    );
  return row?.total ?? 0;
}

export async function getRoutePrice(
  routeId: string,
  varietyId: string,
  executor: DbExecutor = db,
): Promise<SelectRoutePrice | undefined> {
  const [routePrice] = await executor
    .select()
    .from(routePricesTable)
    .where(and(eq(routePricesTable.routeId, routeId), eq(routePricesTable.varietyId, varietyId)));
  return routePrice;
}

export async function listPricesForRoute(
  routeId: string,
  executor: DbExecutor = db,
): Promise<SelectRoutePrice[]> {
  return executor.select().from(routePricesTable).where(eq(routePricesTable.routeId, routeId));
}

// Insert or overwrite the one price for (Route, variety).
export async function upsertRoutePrice(
  input: { routeId: string; varietyId: string; pricePaise: number },
  executor: DbExecutor = db,
): Promise<SelectRoutePrice> {
  const rows = await executor
    .insert(routePricesTable)
    .values(input)
    .onConflictDoUpdate({
      target: [routePricesTable.routeId, routePricesTable.varietyId],
      set: { pricePaise: input.pricePaise, updatedAt: new Date() },
    })
    .returning();
  return firstOrThrow(rows, "upsertRoutePrice");
}

export async function deleteRoutePrice(
  routeId: string,
  varietyId: string,
  executor: DbExecutor = db,
): Promise<SelectRoutePrice | undefined> {
  const [deleted] = await executor
    .delete(routePricesTable)
    .where(and(eq(routePricesTable.routeId, routeId), eq(routePricesTable.varietyId, varietyId)))
    .returning();
  return deleted;
}

// Every variety that is active or already priced on this Route, with its price here (or null).
export async function listRoutePriceForm(
  routeId: string,
  executor: DbExecutor = db,
): Promise<RoutePriceFormRow[]> {
  return executor
    .select({
      varietyId: productVarietiesTable.id,
      productName: productsTable.name,
      varietyName: productVarietiesTable.name,
      sku: productVarietiesTable.sku,
      unit: productVarietiesTable.unit,
      varietyActive: sql<boolean>`(${productVarietiesTable.status} = 'active' AND ${productVarietiesTable.deletedAt} IS NULL)`,
      pricePaise: routePricesTable.pricePaise,
      pricedOnAnyRoute: sql<boolean>`EXISTS (
        SELECT 1 FROM route_prices AS any_price WHERE any_price.variety_id = product_varieties.id
      )`,
    })
    .from(productVarietiesTable)
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .leftJoin(
      routePricesTable,
      and(
        eq(routePricesTable.varietyId, productVarietiesTable.id),
        eq(routePricesTable.routeId, routeId),
      ),
    )
    .where(
      or(
        and(eq(productVarietiesTable.status, "active"), isNull(productVarietiesTable.deletedAt)),
        isNotNull(routePricesTable.id),
      ),
    )
    .orderBy(asc(productsTable.name), asc(productVarietiesTable.name));
}

// The variety row, active or not; a Route price may be set on any variety that exists.
export async function varietyExists(
  varietyId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: productVarietiesTable.id })
    .from(productVarietiesTable)
    .where(eq(productVarietiesTable.id, varietyId));
  return Boolean(row);
}

// "Product variety" labels for refusal messages.
export async function listVarietyLabels(
  varietyIds: string[],
  executor: DbExecutor = db,
): Promise<Array<{ varietyId: string; label: string }>> {
  if (varietyIds.length === 0) return [];
  return executor
    .select({
      varietyId: productVarietiesTable.id,
      label: sql<string>`${productsTable.name} || ' ' || ${productVarietiesTable.name}`,
    })
    .from(productVarietiesTable)
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(inArray(productVarietiesTable.id, varietyIds))
    .orderBy(asc(productsTable.name), asc(productVarietiesTable.name));
}
