import { db } from "@repo/database";
import {
  listSeriesForYear,
  lockSeriesForYear,
  type DocumentKind,
} from "@repo/database/queries/document-number-series";
import { getGstCreditNoteDeadlineRow } from "@repo/database/queries/gst-credit-note-deadlines";
import {
  getEarliestSettingsUse,
  insertGstCreditNoteDeadline,
  insertSellerSettings,
  listSellerSettingsRows,
  listSettingsHistory,
  lockGstCreditNoteDeadlineRow,
  lockSellerSettingsRows,
  lockSellerSettingsTable,
  updateGstCreditNoteDeadline,
  updateSellerSettingsRow,
  updateSeriesPrefix,
} from "@repo/database/queries/settings";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { SelectGstCreditNoteDeadline, SelectSellerSettings } from "@repo/database/schema";

import DocumentNumberService, { formatDocumentNumber } from "../document-numbers";
import { badRequest, internalError, screenRefusal } from "../errors";
import GstCreditNoteDeadlineService from "../gst-credit-note-deadline";
import { changedFields, createdFields, oldNewPayload, recordAudit } from "../shared/audit";
import { sellerMasterMissingRefusal } from "../shared/checkout";
import {
  financialYearBounds,
  financialYearOf,
  financialYearOfInstant,
} from "../shared/financial-year";
import { INDIAN_STATES } from "../shared/indian-states";
import {
  creditNoteDeadlineYearSchema,
  listNumberSeriesInputSchema,
  prepareFinancialYearInputSchema,
  seriesIdSchema,
  setCreditNoteDeadlineInputSchema,
  setUpSellerSettingsInputSchema,
  updatePrefixInputSchema,
  updateSellerSettingsInputSchema,
  type CreditNoteDeadlineEntry,
  type ListNumberSeriesInput,
  type NumberSeriesEntry,
  type PrepareFinancialYearInput,
  type SellerSetupDefaults,
  type SetCreditNoteDeadlineInput,
  type SettingsHistoryEntry,
  type SetUpSellerSettingsInput,
  type UpdatePrefixInput,
  type UpdateSellerSettingsInput,
} from "./model";

// ADR-0002, CA-confirmed. Prefills the one-time setup form; never written without the Admin.
const SELLER_SETUP_DEFAULTS: SellerSetupDefaults = {
  legalName: "MOTAKE MILK AND MILK PRODUCT",
  address: "GAT NO 6, MOTAKE MALA, NANDANI ROAD, JAMBHALI-416121",
  state: "Maharashtra",
  gstin: "27EHCPP4509Q1ZP",
  phone: "9822418224",
  email: "akashpatil8090@gmail.com",
};

const sellerAuditedFields = [
  "legalName",
  "address",
  "state",
  "gstin",
  "phone",
  "email",
  "pan",
  "bankAccountName",
  "bankName",
  "bankBranch",
  "bankAccountNumber",
  "bankIfsc",
  "terms",
  "place",
] as const;

// GST allows 16 characters; a 2-letter prefix always fits, this only guards the rule.
const MAX_DOCUMENT_NUMBER_LENGTH = 16;

const documentNumbers = new DocumentNumberService();
const gstCreditNoteDeadlines = new GstCreditNoteDeadlineService();

function assertGstinMatchesState(gstin: string, state: string): void {
  const code = INDIAN_STATES.find((candidate) => candidate.name === state)?.gstStateCode;
  if (gstin.slice(0, 2) !== code) {
    throw screenRefusal(
      "gstin_state_mismatch",
      `GSTIN ${gstin} does not belong to ${state} (state code ${code})`,
      { state },
    );
  }
}

// A PAN is characters 3–12 of the GSTIN issued to it.
function assertPanMatchesGstin(pan: string | null | undefined, gstin: string): void {
  if (pan && gstin.slice(2, 12) !== pan) {
    throw screenRefusal("pan_gstin_mismatch", `PAN ${pan} does not match GSTIN ${gstin}`);
  }
}

function onlySellerRow(rows: SelectSellerSettings[]): SelectSellerSettings | null {
  if (rows.length > 1) {
    throw internalError("More than one Seller master row exists; fix the data before continuing");
  }
  return rows[0] ?? null;
}

function startYearOf(financialYear: string): number {
  return Number(financialYearBounds(financialYear).firstDay.slice(0, 4));
}

function currentFinancialYear(): string {
  return financialYearOfInstant(new Date());
}

function nextFinancialYearOf(financialYear: string): string {
  return financialYearOf(`${startYearOf(financialYear) + 1}-04-01`);
}

// Prefixes can be changed for the current and the next financial year only.
function assertPrefixYearEditable(financialYear: string): void {
  const current = currentFinancialYear();
  if (startYearOf(financialYear) < startYearOf(current)) {
    throw screenRefusal(
      "financial_year_ended",
      `Financial year ${financialYear} has ended; its prefixes are read-only`,
    );
  }
  if (startYearOf(financialYear) > startYearOf(current) + 1) {
    throw screenRefusal(
      "financial_year_too_far",
      `Financial year ${financialYear} is too far ahead; only ${nextFinancialYearOf(current)} can be prepared`,
    );
  }
}

class SettingsService {
  // Null until the Admin sets the Seller master up.
  public async getSellerSettings(executor: DbExecutor = db): Promise<SelectSellerSettings | null> {
    return onlySellerRow(await listSellerSettingsRows(executor));
  }

  // Checkout, Bill and Note issue call this before snapshotting the seller.
  public async requireSellerSettings(executor: DbExecutor = db): Promise<SelectSellerSettings> {
    const settings = await this.getSellerSettings(executor);
    if (!settings) throw sellerMasterMissingRefusal();
    return settings;
  }

  public getSellerSetupDefaults(): SellerSetupDefaults {
    return { ...SELLER_SETUP_DEFAULTS };
  }

  public async setUpSellerSettings(
    input: SetUpSellerSettingsInput,
    actorProfileId: string,
  ): Promise<SelectSellerSettings> {
    const { reason, ...fields } = setUpSellerSettingsInputSchema.parse(input);
    assertGstinMatchesState(fields.gstin, fields.state);
    assertPanMatchesGstin(fields.pan, fields.gstin);
    return runInTransaction(async (transaction) => {
      await lockSellerSettingsTable(transaction);
      const existing = await listSellerSettingsRows(transaction);
      if (existing.length > 0) {
        throw screenRefusal("seller_master_exists", "Seller master is already set up");
      }
      const settings = await insertSellerSettings(
        { ...fields, email: fields.email ?? null, updatedBy: actorProfileId },
        transaction,
      );
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "created",
          entityType: "seller_settings",
          entityId: settings.id,
          reason,
          payload: createdFields(fields),
        },
        transaction,
      );
      return settings;
    });
  }

  // Saving the current values changes nothing and records nothing. Old Bills and Notes keep the
  // seller they were issued with.
  public async updateSellerSettings(
    input: UpdateSellerSettingsInput,
    actorProfileId: string,
  ): Promise<SelectSellerSettings> {
    const { reason, ...patch } = updateSellerSettingsInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const before = onlySellerRow(await lockSellerSettingsRows(transaction));
      if (!before) throw screenRefusal("seller_master_missing", "Seller master not set up");
      const givenFields = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      const merged: SelectSellerSettings = { ...before, ...givenFields };
      const changes = changedFields(before, merged, sellerAuditedFields);
      if (Object.keys(changes).length === 0) return before;
      assertGstinMatchesState(merged.gstin, merged.state);
      assertPanMatchesGstin(merged.pan, merged.gstin);

      const changedValues = Object.fromEntries(
        Object.keys(changes).map((field) => [field, merged[field as keyof typeof merged] ?? null]),
      );
      const after = await updateSellerSettingsRow(
        before.id,
        { ...changedValues, updatedBy: actorProfileId },
        transaction,
      );
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "updated",
          entityType: "seller_settings",
          entityId: before.id,
          reason,
          payload: oldNewPayload(changes),
        },
        transaction,
      );
      return after;
    });
  }

  public async listSellerSettingsHistory(): Promise<SettingsHistoryEntry[]> {
    const settings = await this.getSellerSettings();
    if (!settings) return [];
    return listSettingsHistory("seller_settings", settings.id);
  }

  // Five entries; reading never creates a series row.
  public async listNumberSeries(input: ListNumberSeriesInput): Promise<NumberSeriesEntry[]> {
    const financialYear = listNumberSeriesInputSchema.parse(input);
    const current = currentFinancialYear();
    const yearEditable =
      financialYear === current || financialYear === nextFinancialYearOf(current);
    const [series, rows] = await Promise.all([
      documentNumbers.getSeries(financialYear),
      listSeriesForYear(financialYear),
    ]);
    return series.map((entry) => ({
      id: rows.find((row) => row.kind === entry.kind)?.id ?? null,
      kind: entry.kind,
      prefix: entry.prefix,
      saved: entry.saved,
      nextSeq: entry.nextSeq,
      firstUsedAt: entry.firstUsedAt,
      editable: yearEditable && !entry.firstUsedAt,
      nextNumberPreview: formatDocumentNumber(entry.prefix, financialYear, entry.nextSeq),
    }));
  }

  // Takes the allocator's row locks, in its order: a change that waits behind the year's first number
  // sees it and is refused; a change that wins is the prefix that number uses.
  public async updatePrefix(
    input: UpdatePrefixInput,
    actorProfileId: string,
  ): Promise<NumberSeriesEntry[]> {
    const parsedInput = updatePrefixInputSchema.parse(input);
    const { financialYear, kind, prefix, reason } = parsedInput;
    assertPrefixYearEditable(financialYear);
    if (formatDocumentNumber(prefix, financialYear, 1).length > MAX_DOCUMENT_NUMBER_LENGTH) {
      throw screenRefusal(
        "prefix_too_long",
        `Prefix ${prefix} makes numbers longer than 16 characters`,
      );
    }

    await runInTransaction(async (transaction) => {
      await this.ensureYearWithAudit(financialYear, actorProfileId, reason, transaction);
      // Locks the whole year, not just this kind, so two changes cannot both take the same prefix.
      const yearRows = await lockSeriesForYear(financialYear, transaction);
      const series = yearRows.find((row) => row.kind === kind);
      if (!series) {
        throw screenRefusal("number_series_missing", `Series ${kind} ${financialYear} missing`);
      }
      if (series.firstUsedAt) {
        throw screenRefusal(
          "prefix_frozen",
          `The ${kind} prefix for ${financialYear} is frozen: its first number has been issued`,
        );
      }
      if (series.prefix === prefix) return;
      const clash = yearRows.find((row) => row.kind !== kind && row.prefix === prefix);
      if (clash) {
        throw screenRefusal(
          "prefix_taken",
          `Prefix ${prefix} is already used by ${clash.kind} in ${financialYear}`,
        );
      }
      await updateSeriesPrefix(
        { seriesId: series.id, prefix, actorId: actorProfileId },
        transaction,
      );
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "updated",
          entityType: "document_number_series",
          entityId: series.id,
          reason,
          payload: { financialYear, kind, prefix: { old: series.prefix, new: prefix } },
        },
        transaction,
      );
    });
    return this.listNumberSeries(financialYear);
  }

  // Next financial year only. Existing series are left alone, so running it twice is harmless.
  public async prepareFinancialYear(
    input: PrepareFinancialYearInput,
    actorProfileId: string,
  ): Promise<NumberSeriesEntry[]> {
    const { financialYear, reason } = prepareFinancialYearInputSchema.parse(input);
    const nextYear = nextFinancialYearOf(currentFinancialYear());
    if (financialYear !== nextYear) {
      throw badRequest(`Only the next financial year (${nextYear}) can be prepared`);
    }
    await runInTransaction((transaction) =>
      this.ensureYearWithAudit(financialYear, actorProfileId, reason, transaction),
    );
    return this.listNumberSeries(financialYear);
  }

  public async listNumberSeriesHistory(seriesId: string): Promise<SettingsHistoryEntry[]> {
    return listSettingsHistory("document_number_series", seriesIdSchema.parse(seriesId));
  }

  // One entry per financial year, newest first, from the earliest year in use (or the current year)
  // to the next year.
  public async listCreditNoteDeadlines(): Promise<CreditNoteDeadlineEntry[]> {
    const firstStartYear = await this.earliestDeadlineStartYear();
    const lastStartYear = startYearOf(currentFinancialYear()) + 1;
    const entries: CreditNoteDeadlineEntry[] = [];
    for (let startYear = lastStartYear; startYear >= firstStartYear; startYear -= 1) {
      const financialYear = financialYearOf(`${startYear}-04-01`);
      entries.push({ financialYear, ...(await gstCreditNoteDeadlines.getDeadline(financialYear)) });
    }
    return entries;
  }

  // Saving the default date keeps the year configured at that date; there is no delete.
  public async setCreditNoteDeadline(
    input: SetCreditNoteDeadlineInput,
    actorProfileId: string,
  ): Promise<CreditNoteDeadlineEntry> {
    const { financialYear, date, reason } = setCreditNoteDeadlineInputSchema.parse(input);
    const startYear = startYearOf(financialYear);
    if (startYear > startYearOf(currentFinancialYear()) + 1) {
      throw badRequest(`Financial year ${financialYear} is too far ahead for a deadline`);
    }
    if (startYear < (await this.earliestDeadlineStartYear())) {
      throw badRequest(
        `Financial year ${financialYear} has no Bills or settings to set a deadline for`,
      );
    }
    const { lastDay } = financialYearBounds(financialYear);
    if (date <= lastDay) {
      throw screenRefusal(
        "deadline_too_early",
        `The deadline for ${financialYear} must be after ${lastDay}`,
        { date: lastDay },
      );
    }

    await runInTransaction(async (transaction) => {
      const existing = await lockGstCreditNoteDeadlineRow(financialYear, transaction);
      if (existing) {
        await this.changeDeadline(existing, date, reason, actorProfileId, transaction);
        return;
      }
      const { deadlineDate: defaultDate } = await gstCreditNoteDeadlines.getDeadline(
        financialYear,
        transaction,
      );
      const created = await insertGstCreditNoteDeadline(
        { financialYear, deadlineDate: date, updatedBy: actorProfileId },
        transaction,
      );
      if (!created) {
        throw screenRefusal(
          "deadline_changed",
          `The ${financialYear} deadline was just saved by someone else; reload and retry`,
        );
      }
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "created",
          entityType: "gst_credit_note_deadline",
          entityId: created.id,
          reason,
          payload: { financialYear, deadlineDate: { old: null, new: date }, defaultDate },
        },
        transaction,
      );
    });
    return { financialYear, ...(await gstCreditNoteDeadlines.getDeadline(financialYear)) };
  }

  public async listCreditNoteDeadlineHistory(
    financialYear: string,
  ): Promise<SettingsHistoryEntry[]> {
    const row = await getGstCreditNoteDeadlineRow(
      creditNoteDeadlineYearSchema.parse(financialYear),
    );
    if (!row) return [];
    return listSettingsHistory("gst_credit_note_deadline", row.id);
  }

  private async changeDeadline(
    existing: SelectGstCreditNoteDeadline,
    date: string,
    reason: string | undefined,
    actorProfileId: string,
    transaction: DbExecutor,
  ): Promise<void> {
    if (existing.deadlineDate === date) return;
    await updateGstCreditNoteDeadline(
      { id: existing.id, deadlineDate: date, updatedBy: actorProfileId },
      transaction,
    );
    await recordAudit(
      {
        actorId: actorProfileId,
        action: "updated",
        entityType: "gst_credit_note_deadline",
        entityId: existing.id,
        reason,
        payload: { deadlineDate: { old: existing.deadlineDate, new: date } },
      },
      transaction,
    );
  }

  private async earliestDeadlineStartYear(): Promise<number> {
    const earliest = await getEarliestSettingsUse();
    const candidates = [
      currentFinancialYear(),
      earliest.seriesFinancialYear,
      earliest.deadlineFinancialYear,
      earliest.billDate ? financialYearOf(earliest.billDate) : null,
    ].filter((financialYear): financialYear is string => financialYear !== null);
    return Math.min(...candidates.map(startYearOf));
  }

  // Creates the year's missing series with default prefixes and audits each one it created.
  private async ensureYearWithAudit(
    financialYear: string,
    actorProfileId: string,
    reason: string | undefined,
    transaction: DbExecutor,
  ): Promise<DocumentKind[]> {
    const insertedKinds = await documentNumbers.ensureFinancialYear(
      { financialYear, actorId: actorProfileId },
      transaction,
    );
    if (insertedKinds.length === 0) return insertedKinds;
    const rows = await listSeriesForYear(financialYear, transaction);
    for (const row of rows.filter((candidate) => insertedKinds.includes(candidate.kind))) {
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "created",
          entityType: "document_number_series",
          entityId: row.id,
          reason,
          payload: { financialYear, kind: row.kind, prefix: row.prefix },
        },
        transaction,
      );
    }
    return insertedKinds;
  }
}

export default SettingsService;
export type {
  CreditNoteDeadlineEntry,
  NumberSeriesEntry,
  SellerSetupDefaults,
  SettingsHistoryEntry,
  SetUpSellerSettingsInput,
  UpdatePrefixInput,
  UpdateSellerSettingsInput,
};
