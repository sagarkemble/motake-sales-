import { asc, eq, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  unitsOfMeasureTable,
  type InsertUnitOfMeasure,
  type SelectUnitOfMeasure,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

// ml, L, g and kg first, then the units Admin added, oldest first.
export async function listUnitsOfMeasure(
  executor: DbExecutor = db,
): Promise<SelectUnitOfMeasure[]> {
  return executor
    .select()
    .from(unitsOfMeasureTable)
    .orderBy(
      sql`coalesce(array_position(ARRAY['ml', 'L', 'g', 'kg']::text[], ${unitsOfMeasureTable.code}::text), 5)`,
      asc(unitsOfMeasureTable.createdAt),
      asc(unitsOfMeasureTable.code),
    );
}

export async function getUnitOfMeasureByCode(
  code: string,
  executor: DbExecutor = db,
): Promise<SelectUnitOfMeasure | undefined> {
  const [unit] = await executor
    .select()
    .from(unitsOfMeasureTable)
    .where(eq(unitsOfMeasureTable.code, code));
  return unit;
}

// A unit whose code matches in any letter case.
export async function findUnitOfMeasureIgnoringCase(
  code: string,
  executor: DbExecutor = db,
): Promise<SelectUnitOfMeasure | undefined> {
  const [unit] = await executor
    .select()
    .from(unitsOfMeasureTable)
    .where(sql`lower(${unitsOfMeasureTable.code}) = lower(${code})`)
    .limit(1);
  return unit;
}

export async function createUnitOfMeasure(
  newUnit: InsertUnitOfMeasure,
  executor: DbExecutor = db,
): Promise<SelectUnitOfMeasure> {
  const insertedRows = await executor.insert(unitsOfMeasureTable).values(newUnit).returning();
  return firstOrThrow(insertedRows, "createUnitOfMeasure");
}
