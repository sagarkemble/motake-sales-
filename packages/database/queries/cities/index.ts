import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../../index";
import { citiesTable, type InsertCity, type SelectCity } from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

// Every city, by state then name.
export async function listCities(executor: DbExecutor = db): Promise<SelectCity[]> {
  return executor
    .select()
    .from(citiesTable)
    .orderBy(asc(citiesTable.state), asc(sql`lower(${citiesTable.name})`));
}

export async function getCityById(
  cityId: string,
  executor: DbExecutor = db,
): Promise<SelectCity | undefined> {
  const [city] = await executor.select().from(citiesTable).where(eq(citiesTable.id, cityId));
  return city;
}

// A city of that state whose name matches in any letter case.
export async function findCityByNameIgnoringCase(
  state: string,
  name: string,
  executor: DbExecutor = db,
): Promise<SelectCity | undefined> {
  const [city] = await executor
    .select()
    .from(citiesTable)
    .where(and(eq(citiesTable.state, state), sql`lower(${citiesTable.name}) = lower(${name})`))
    .limit(1);
  return city;
}

export async function createCity(
  newCity: InsertCity,
  executor: DbExecutor = db,
): Promise<SelectCity> {
  const insertedRows = await executor.insert(citiesTable).values(newCity).returning();
  return firstOrThrow(insertedRows, "createCity");
}
