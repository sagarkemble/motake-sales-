import { db } from "@repo/database";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import {
  deleteVarietyTaxPeriod,
  getVarietyForTaxPeriods,
  getVarietyTaxPeriodById,
  getVarietyTaxPeriodByStart,
  listCoveringVarietyTaxPeriods,
  listVarietyLabelsByIds,
  listVarietyTaxPeriods,
  lockLiveVarietyForTaxPeriods,
  upsertVarietyTaxPeriod,
} from "@repo/database/queries/variety-tax-periods";
import type { SelectVarietyTaxPeriod } from "@repo/database/schema";

import { badRequest, noCoveringTaxPeriod, notFound, screenRefusal } from "../errors";
import { changedFields, createdFields, recordAudit } from "../shared/audit";
import { financialYearBounds, financialYearOf } from "../shared/financial-year";
import {
  coveringTaxFactsInputSchema,
  currentForVarietiesInputSchema,
  periodIdSchema,
  upsertTaxPeriodInputSchema,
  varietyIdSchema,
  type CoveringTaxFactsInput,
  type CurrentForVarietiesInput,
  type CurrentTax,
  type DeleteTaxPeriodResult,
  type FinancialYearWindow,
  type TaxFacts,
  type TaxPeriodList,
  type UpsertTaxPeriodInput,
  type UpsertTaxPeriodResult,
} from "./model";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const taxAuditedFields = ["hsn", "exempt", "gstRateBps"] as const;

// 2026-04-01 → 1 Apr 2026.
function displayDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month! - 1]} ${year}`;
}

function toTaxFacts(period: SelectVarietyTaxPeriod): TaxFacts {
  return {
    periodId: period.id,
    effectiveFrom: period.effectiveFrom,
    hsn: period.hsn,
    exempt: period.exempt,
    gstRateBps: period.gstRateBps,
  };
}

// Today in Asia/Kolkata and the GST financial year it falls in.
function currentWindow(): { today: string; currentFinancialYear: FinancialYearWindow } {
  const today = businessDateOf(new Date());
  const financialYear = financialYearOf(today);
  return { today, currentFinancialYear: { financialYear, ...financialYearBounds(financialYear) } };
}

function inWindow(day: string, window: FinancialYearWindow): boolean {
  return day >= window.firstDay && day <= window.lastDay;
}

function windowText(window: FinancialYearWindow): string {
  return `${displayDay(window.firstDay)} to ${displayDay(window.lastDay)}`;
}

// Dated, company-wide GST per Variety. A period has a start and no end; the latest start on or
// before a day covers it. No covering period means the Variety cannot be sold that day.
class VarietyTaxPeriodService {
  // Every period, newest start first, plus the current financial year for the date picker.
  public async listForVariety(
    varietyId: string,
    executor: DbExecutor = db,
  ): Promise<TaxPeriodList> {
    const parsedVarietyId = varietyIdSchema.parse(varietyId);
    const variety = await getVarietyForTaxPeriods(parsedVarietyId, executor);
    if (!variety) throw notFound(`Product variety ${parsedVarietyId} not found`);
    const { today, currentFinancialYear } = currentWindow();
    const periods = await listVarietyTaxPeriods(parsedVarietyId, executor);
    const covering = periods.find((period) => period.effectiveFrom <= today);
    // A soft-deleted Variety's periods are read-only: upsert and delete refuse it.
    const live = variety.deletedAt === null;
    return {
      today,
      currentFinancialYear,
      periods: periods.map((period) => ({
        ...period,
        coversToday: period.id === covering?.id,
        upcoming: period.effectiveFrom > today,
        editable: live && inWindow(period.effectiveFrom, currentFinancialYear),
      })),
    };
  }

  // The period covering today per Variety, or null, in the order asked.
  public async getCurrentForVarieties(
    varietyIds: CurrentForVarietiesInput,
    executor: DbExecutor = db,
  ): Promise<CurrentTax[]> {
    const parsedVarietyIds = currentForVarietiesInputSchema.parse(varietyIds);
    const facts = await this.getCoveringTaxFacts(
      { varietyIds: parsedVarietyIds, day: businessDateOf(new Date()) },
      executor,
    );
    return parsedVarietyIds.map((varietyId) => ({
      varietyId,
      period: facts.get(varietyId) ?? null,
    }));
  }

  // For sales: pass the sale's transaction so the read sees the same tax state as the write.
  // Varieties with no covering period are absent from the map.
  public async getCoveringTaxFacts(
    input: CoveringTaxFactsInput,
    executor: DbExecutor = db,
  ): Promise<Map<string, TaxFacts>> {
    const parsedInput = coveringTaxFactsInputSchema.parse(input);
    const periods = await listCoveringVarietyTaxPeriods(parsedInput, executor);
    return new Map(periods.map((period) => [period.varietyId, toTaxFacts(period)]));
  }

  // Same as getCoveringTaxFacts, but refuses once, naming every Variety with no covering period.
  public async requireCoveringTaxFacts(
    input: CoveringTaxFactsInput,
    executor: DbExecutor = db,
  ): Promise<Map<string, TaxFacts>> {
    const parsedInput = coveringTaxFactsInputSchema.parse(input);
    const facts = await this.getCoveringTaxFacts(parsedInput, executor);
    const uncoveredIds = [...new Set(parsedInput.varietyIds)].filter((id) => !facts.has(id));
    if (uncoveredIds.length === 0) return facts;
    const labels = await listVarietyLabelsByIds(uncoveredIds, executor);
    const uncovered = uncoveredIds.map(
      (id) => labels.find((label) => label.id === id) ?? { id, name: id, sku: "" },
    );
    throw noCoveringTaxPeriod(uncovered, parsedInput.day);
  }

  // Add or Edit. A start that already exists for the Variety overwrites HSN, exempt and rate.
  public async upsert(
    input: UpsertTaxPeriodInput,
    actorProfileId: string,
  ): Promise<UpsertTaxPeriodResult> {
    const parsedInput = upsertTaxPeriodInputSchema.parse(input);
    if (parsedInput.exempt && parsedInput.gstRateBps !== 0) {
      throw screenRefusal(
        "gst_exempt_rate_not_zero",
        "An exempt period must have a GST rate of 0%",
      );
    }
    if (!parsedInput.exempt && parsedInput.gstRateBps <= 0) {
      throw screenRefusal("gst_rate_required", "A taxable period must have a GST rate above 0%");
    }
    const { currentFinancialYear } = currentWindow();
    if (!inWindow(parsedInput.effectiveFrom, currentFinancialYear)) {
      throw screenRefusal(
        "gst_start_outside_window",
        `Only starts from ${windowText(currentFinancialYear)} can be added or changed`,
      );
    }

    return runInTransaction(async (transaction) => {
      const variety = await lockLiveVarietyForTaxPeriods(parsedInput.varietyId, transaction);
      if (!variety) throw notFound(`Product variety ${parsedInput.varietyId} not found`);
      const before = await getVarietyTaxPeriodByStart(parsedInput, transaction);
      const period = await upsertVarietyTaxPeriod(parsedInput, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: before ? "updated" : "created",
          entityType: "variety_tax_period",
          entityId: period.id,
          payload: before
            ? changedFields(before, period, taxAuditedFields)
            : createdFields(parsedInput),
        },
        transaction,
      );
      return { period, outcome: before ? "overwritten" : "created" };
    });
  }

  // The covering rule then applies to what is left: an earlier period covers again, or nothing.
  public async delete(periodId: string, actorProfileId: string): Promise<DeleteTaxPeriodResult> {
    const parsedPeriodId = periodIdSchema.parse(periodId);
    const { today, currentFinancialYear } = currentWindow();

    return runInTransaction(async (transaction) => {
      const existing = await getVarietyTaxPeriodById(parsedPeriodId, transaction);
      if (!existing) throw notFound(`Tax period ${parsedPeriodId} not found`);
      const variety = await lockLiveVarietyForTaxPeriods(existing.varietyId, transaction);
      if (!variety) throw notFound(`Product variety ${existing.varietyId} not found`);
      if (!inWindow(existing.effectiveFrom, currentFinancialYear)) {
        throw badRequest(
          `Only periods starting ${windowText(currentFinancialYear)} can be deleted`,
        );
      }
      const deleted = await deleteVarietyTaxPeriod(parsedPeriodId, transaction);
      if (!deleted) throw notFound(`Tax period ${parsedPeriodId} not found`);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "deleted",
          entityType: "variety_tax_period",
          entityId: deleted.id,
          payload: {
            varietyId: deleted.varietyId,
            effectiveFrom: deleted.effectiveFrom,
            hsn: deleted.hsn,
            exempt: deleted.exempt,
            gstRateBps: deleted.gstRateBps,
          },
        },
        transaction,
      );
      const facts = await this.getCoveringTaxFacts(
        { varietyIds: [deleted.varietyId], day: today },
        transaction,
      );
      return { deleted, coveringToday: facts.get(deleted.varietyId) ?? null };
    });
  }
}

export default VarietyTaxPeriodService;
export type {
  CoveringTaxFactsInput,
  CurrentTax,
  DeleteTaxPeriodResult,
  TaxFacts,
  TaxPeriodList,
  UpsertTaxPeriodInput,
  UpsertTaxPeriodResult,
};
