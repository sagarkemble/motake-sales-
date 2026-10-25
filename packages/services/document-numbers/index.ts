import { db } from "@repo/database";
import {
  insertMissingSeries,
  listSeriesForYear,
  lockSeriesRow,
  markSeriesUsed,
  type DocumentKind,
} from "@repo/database/queries/document-number-series";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { SelectDocumentNumberSeries } from "@repo/database/schema";

import { conflict, internalError } from "../errors";
import {
  allocateInputSchema,
  DEFAULT_PREFIXES,
  DOCUMENT_KINDS,
  financialYearInputSchema,
  getSeriesInputSchema,
  type AllocatedNumber,
  type AllocateInput,
  type FinancialYearInput,
  type GetSeriesInput,
  type SeriesEntry,
} from "./model";

// Six digits up to 999,999; seven unpadded digits still fit the 16-character GST limit.
const MAX_SEQ = 9_999_999;

export function formatDocumentNumber(prefix: string, financialYear: string, seq: number): string {
  return `${prefix}/${financialYear}/${String(seq).padStart(6, "0")}`;
}

// Bill, Note, Payment and Refund numbers. Allocation runs inside the caller's transaction, so a
// rollback gives the number back. Callers allocate every number before locking a Customer row.
class DocumentNumberService {
  // Returns the kinds it inserted.
  public async ensureFinancialYear(
    input: FinancialYearInput,
    executor: DbExecutor,
  ): Promise<DocumentKind[]> {
    const parsedInput = financialYearInputSchema.parse(input);
    return insertMissingSeries({ ...parsedInput, prefixes: DEFAULT_PREFIXES }, executor);
  }

  public async lockSeriesRow(
    input: AllocateInput,
    executor: DbExecutor,
  ): Promise<SelectDocumentNumberSeries> {
    const parsedInput = allocateInputSchema.parse(input);
    let row = await lockSeriesRow(parsedInput, executor);
    if (!row) {
      // A year's rows are created in their own short transaction, so the caller's transaction never
      // holds uncommitted rows for the other four kinds (different series must not block each other).
      await runInTransaction((transaction) => this.ensureFinancialYear(parsedInput, transaction));
      row = await lockSeriesRow(parsedInput, executor);
    }
    if (!row)
      throw internalError(`Series ${parsedInput.kind} ${parsedInput.financialYear} missing`);
    return row;
  }

  public async allocate(input: AllocateInput, executor: DbExecutor): Promise<AllocatedNumber> {
    const parsedInput = allocateInputSchema.parse(input);
    const series = await this.lockSeriesRow(parsedInput, executor);
    if (series.nextSeq > MAX_SEQ) {
      throw conflict(
        `The ${parsedInput.kind} series for ${parsedInput.financialYear} has run out of numbers`,
      );
    }
    await markSeriesUsed({ seriesId: series.id, actorId: parsedInput.actorId }, executor);
    return {
      number: formatDocumentNumber(series.prefix, parsedInput.financialYear, series.nextSeq),
      prefix: series.prefix,
      seq: series.nextSeq,
      financialYear: parsedInput.financialYear,
    };
  }

  // Always five entries; a kind with no row yet shows its default and `saved: false`. Never inserts.
  public async getSeries(input: GetSeriesInput, executor: DbExecutor = db): Promise<SeriesEntry[]> {
    const financialYear = getSeriesInputSchema.parse(input);
    const rows = await listSeriesForYear(financialYear, executor);
    return DOCUMENT_KINDS.map((kind) => {
      const row = rows.find((candidate) => candidate.kind === kind);
      return {
        kind,
        prefix: row?.prefix ?? DEFAULT_PREFIXES[kind],
        nextSeq: row?.nextSeq ?? 1,
        firstUsedAt: row?.firstUsedAt ?? null,
        frozen: Boolean(row?.firstUsedAt),
        saved: Boolean(row),
      };
    });
  }
}

export default DocumentNumberService;
export { DEFAULT_PREFIXES, DOCUMENT_KINDS } from "./model";
export type { AllocatedNumber, AllocateInput, DocumentKind, SeriesEntry };
