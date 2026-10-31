import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "../../index";
import {
  productVarietiesTable,
  varietyTaxPeriodsTable,
  type InsertVarietyTaxPeriod,
  type SelectProductVariety,
  type SelectVarietyTaxPeriod,
} from "../../schema";
import type { DbExecutor } from "../shared/executor";

export type VarietyLabel = Pick<SelectProductVariety, "id" | "name" | "sku">;

// Any Variety, soft-deleted or not, so Admin can still read a deactivated Variety's history.
export async function getVarietyForTaxPeriods(
  varietyId: string,
  executor: DbExecutor = db,
): Promise<SelectProductVariety | undefined> {
  const [variety] = await executor
    .select()
    .from(productVarietiesTable)
    .where(eq(productVarietiesTable.id, varietyId));
  return variety;
}

// Locks a live Variety so tax period writes for it run one at a time. Undefined when the Variety
// is missing or soft-deleted.
export async function lockLiveVarietyForTaxPeriods(
  varietyId: string,
  executor: DbExecutor = db,
): Promise<SelectProductVariety | undefined> {
  const [variety] = await executor
    .select()
    .from(productVarietiesTable)
    .where(and(eq(productVarietiesTable.id, varietyId), isNull(productVarietiesTable.deletedAt)))
    .for("no key update");
  return variety;
}

export async function listVarietyLabelsByIds(
  varietyIds: string[],
  executor: DbExecutor = db,
): Promise<VarietyLabel[]> {
  if (varietyIds.length === 0) return [];
  return executor
    .select({
      id: productVarietiesTable.id,
      name: productVarietiesTable.displayName,
      sku: productVarietiesTable.sku,
    })
    .from(productVarietiesTable)
    .where(inArray(productVarietiesTable.id, varietyIds))
    .orderBy(asc(productVarietiesTable.displayName));
}

// Newest start first.
export async function listVarietyTaxPeriods(
  varietyId: string,
  executor: DbExecutor = db,
): Promise<SelectVarietyTaxPeriod[]> {
  return executor
    .select()
    .from(varietyTaxPeriodsTable)
    .where(eq(varietyTaxPeriodsTable.varietyId, varietyId))
    .orderBy(desc(varietyTaxPeriodsTable.effectiveFrom));
}

export async function getVarietyTaxPeriodById(
  periodId: string,
  executor: DbExecutor = db,
): Promise<SelectVarietyTaxPeriod | undefined> {
  const [period] = await executor
    .select()
    .from(varietyTaxPeriodsTable)
    .where(eq(varietyTaxPeriodsTable.id, periodId));
  return period;
}

export async function getVarietyTaxPeriodByStart(
  input: { varietyId: string; effectiveFrom: string },
  executor: DbExecutor = db,
): Promise<SelectVarietyTaxPeriod | undefined> {
  const [period] = await executor
    .select()
    .from(varietyTaxPeriodsTable)
    .where(
      and(
        eq(varietyTaxPeriodsTable.varietyId, input.varietyId),
        eq(varietyTaxPeriodsTable.effectiveFrom, input.effectiveFrom),
      ),
    );
  return period;
}

// One row per Variety and start: a second write with the same start overwrites HSN, exempt and
// rate and keeps created_at.
export async function upsertVarietyTaxPeriod(
  values: Omit<InsertVarietyTaxPeriod, "id" | "createdAt">,
  executor: DbExecutor = db,
): Promise<SelectVarietyTaxPeriod> {
  const [period] = await executor
    .insert(varietyTaxPeriodsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [varietyTaxPeriodsTable.varietyId, varietyTaxPeriodsTable.effectiveFrom],
      set: { hsn: values.hsn, exempt: values.exempt, gstRateBps: values.gstRateBps },
    })
    .returning();
  return period!;
}

export async function deleteVarietyTaxPeriod(
  periodId: string,
  executor: DbExecutor = db,
): Promise<SelectVarietyTaxPeriod | undefined> {
  const [period] = await executor
    .delete(varietyTaxPeriodsTable)
    .where(eq(varietyTaxPeriodsTable.id, periodId))
    .returning();
  return period;
}

// Per Variety, the row with the latest start on or before `day` (YYYY-MM-DD). Varieties with no
// such row are absent.
export async function listCoveringVarietyTaxPeriods(
  input: { varietyIds: string[]; day: string },
  executor: DbExecutor = db,
): Promise<SelectVarietyTaxPeriod[]> {
  if (input.varietyIds.length === 0) return [];
  return executor
    .selectDistinctOn([varietyTaxPeriodsTable.varietyId])
    .from(varietyTaxPeriodsTable)
    .where(
      and(
        inArray(varietyTaxPeriodsTable.varietyId, input.varietyIds),
        lte(varietyTaxPeriodsTable.effectiveFrom, input.day),
      ),
    )
    .orderBy(varietyTaxPeriodsTable.varietyId, desc(varietyTaxPeriodsTable.effectiveFrom));
}
