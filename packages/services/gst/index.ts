import { db } from "@repo/database";
import {
  countBillsInMonth,
  getBillGstFacts,
  getGstr1FilingByMonth,
  insertGstr1Filing,
  listGstr1Filings,
  lockFilingMonth,
  lockGstr1FilingRow,
  updateGstr1Filing,
} from "@repo/database/queries/gst";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectGstr1Filing } from "@repo/database/schema";

import { notFound, screenRefusal } from "../errors";
import { changedFields, oldNewPayload, recordAudit } from "../shared/audit";
import { gstGatesOf, monthLabelOf, periodMonthOf } from "../shared/gst-gates";
import {
  billIdInputSchema,
  correctGstr1FilingInputSchema,
  previewGstr1FilingInputSchema,
  recordGstr1FilingInputSchema,
  type BillGstState,
  type BillIdInput,
  type CorrectGstr1FilingInput,
  type Gstr1FilingListRow,
  type Gstr1FilingPreview,
  type PreviewGstr1FilingInput,
  type RecordGstr1FilingInput,
  type RecordGstr1FilingResult,
} from "./model";

const filingMonthConstraint = "gstr1_filings_period_month_unique";

function alreadyFiled(month: string) {
  const monthLabel = monthLabelOf(`${month}-01`);
  return screenRefusal(
    "gstr1_already_filed",
    `GSTR-1 for ${monthLabel} is already filed — Correct it.`,
    { month: monthLabel },
  );
}

// GSTR-1 month lock (Spec I). Admin only (checked at the router); every write takes the actor and
// runs in one transaction. Record filing takes the exclusive month lock. Nothing is stamped on a
// Bill: Filed month is derived from gstr1_filings + bill_date.
class GstService {
  // --- GSTR-1 filing.

  public async listGstr1Filings(): Promise<Gstr1FilingListRow[]> {
    return listGstr1Filings();
  }

  // Shown in the confirm step before the first lock of a month.
  public async previewGstr1Filing(input: PreviewGstr1FilingInput): Promise<Gstr1FilingPreview> {
    const parsedInput = previewGstr1FilingInputSchema.parse(input);
    const periodMonth = `${parsedInput.month}-01`;
    this.assertMonthEnded(periodMonth, businessDateOf(new Date()));
    const [filing, counts] = await Promise.all([
      getGstr1FilingByMonth(periodMonth),
      countBillsInMonth(periodMonth),
    ]);
    return { month: parsedInput.month, alreadyFiled: Boolean(filing), ...counts };
  }

  // One filing per month, only once the month is over: the current and future months are refused.
  public async recordGstr1Filing(
    actorProfileId: string,
    input: RecordGstr1FilingInput,
  ): Promise<RecordGstr1FilingResult> {
    const parsedInput = recordGstr1FilingInputSchema.parse(input);
    const periodMonth = `${parsedInput.month}-01`;
    const today = businessDateOf(new Date());
    this.assertMonthEnded(periodMonth, today);
    this.assertFiledOn(parsedInput.filedOn, periodMonth, today);
    const notes = parsedInput.notes || null;
    try {
      return await runInTransaction(async (transaction) => {
        await lockFilingMonth(periodMonth, "exclusive", transaction);
        if (await getGstr1FilingByMonth(periodMonth, transaction)) {
          throw alreadyFiled(parsedInput.month);
        }
        const filing = await insertGstr1Filing(
          {
            periodMonth,
            filedOn: parsedInput.filedOn,
            reference: parsedInput.reference,
            notes,
            filerId: actorProfileId,
          },
          transaction,
        );
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "filed",
            entityType: "gstr1_filing",
            entityId: filing.id,
            customerId: null,
            payload: {
              month: parsedInput.month,
              filedOn: filing.filedOn,
              reference: filing.reference,
              notes: filing.notes,
            },
          },
          transaction,
        );
        return { filing };
      });
    } catch (recordError) {
      if (violatedUniqueConstraint(recordError) === filingMonthConstraint) {
        throw alreadyFiled(parsedInput.month);
      }
      throw recordError;
    }
  }

  // Fixes the filing date, reference and notes with a reason. Never the month or the filer, and
  // never unlocks the month. There is no delete.
  public async correctGstr1Filing(
    actorProfileId: string,
    input: CorrectGstr1FilingInput,
  ): Promise<SelectGstr1Filing> {
    const parsedInput = correctGstr1FilingInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const before = await lockGstr1FilingRow(parsedInput.filingId, transaction);
      if (!before) throw notFound(`GSTR-1 filing ${parsedInput.filingId} not found`);
      this.assertFiledOn(parsedInput.filedOn, before.periodMonth, businessDateOf(new Date()));
      const after = {
        ...before,
        filedOn: parsedInput.filedOn,
        reference: parsedInput.reference,
        notes: parsedInput.notes === undefined ? before.notes : parsedInput.notes || null,
      };
      const changes = changedFields(before, after, ["filedOn", "reference", "notes"]);
      if (Object.keys(changes).length === 0) {
        throw screenRefusal(
          "nothing_changed",
          "Nothing changed. Change the filing date, reference or notes.",
        );
      }
      const updated = await updateGstr1Filing(
        before.id,
        { filedOn: after.filedOn, reference: after.reference, notes: after.notes },
        transaction,
      );
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "corrected",
          entityType: "gstr1_filing",
          entityId: before.id,
          customerId: null,
          reason: parsedInput.reason,
          payload: oldNewPayload(changes),
        },
        transaction,
      );
      return updated;
    });
  }

  // --- Month lock and gates.

  public async isMonthFiled(billDate: string, executor: DbExecutor = db): Promise<boolean> {
    return Boolean(await getGstr1FilingByMonth(periodMonthOf(billDate), executor));
  }

  // The Bill paper's GST block: the Filed month and which Correct/Cancel actions apply, each
  // refused one with its reason. The write paths check the same rule.
  public async getBillGstState(
    input: BillIdInput,
    executor: DbExecutor = db,
  ): Promise<BillGstState> {
    const parsedInput = billIdInputSchema.parse(input);
    const facts = await getBillGstFacts(parsedInput.billId, executor);
    if (!facts) throw notFound(`Bill ${parsedInput.billId} not found`);
    return {
      billId: facts.id,
      billNumber: facts.number,
      month: facts.billDate.slice(0, 7),
      filedMonth: facts.filedMonth,
      cancelled: facts.cancelled,
      ...gstGatesOf(facts),
    };
  }

  // --- Internals.

  // GSTR-1 for a month is filed in a later month: from the 1st of the next month.
  private assertMonthEnded(periodMonth: string, today: string): void {
    if (periodMonth >= periodMonthOf(today)) {
      const from = `1 ${monthLabelOf(nextMonthOf(periodMonth))}`;
      throw screenRefusal(
        "filing_month_not_ended",
        `GSTR-1 for ${monthLabelOf(periodMonth)} can be filed from ${from}, once the month is over.`,
        { month: monthLabelOf(periodMonth), from },
      );
    }
  }

  private assertFiledOn(filedOn: string, periodMonth: string, today: string): void {
    const nextMonth = nextMonthOf(periodMonth);
    if (filedOn < nextMonth) {
      const from = `1 ${monthLabelOf(nextMonth)}`;
      throw screenRefusal(
        "filing_date_before_month_end",
        `The filing date must be on or after ${from}, after ${monthLabelOf(periodMonth)} ends.`,
        { month: monthLabelOf(periodMonth), from },
      );
    }
    if (filedOn > today) {
      throw screenRefusal("filing_date_after_today", "The filing date cannot be after today.");
    }
  }
}

// `2026-10-01` → `2026-11-01`.
function nextMonthOf(periodMonth: string): string {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export default GstService;
export { isCalendarDate } from "./model";
export type { BillGstState, Gstr1FilingListRow, Gstr1FilingPreview, RecordGstr1FilingResult };
