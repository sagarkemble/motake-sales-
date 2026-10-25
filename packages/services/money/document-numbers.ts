import {
  insertMissingSeries,
  listSeriesForYear,
  lockSeriesRow,
  markSeriesUsed,
  type DocumentKind,
} from "@repo/database/queries/money/document-number-series";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { SelectDocumentNumberSeries } from "@repo/database/schema";

import { conflict, internalError } from "../errors";
import { assertFinancialYear } from "./financial-year";

export type { DocumentKind };

// Also the lock order: a transaction that needs several numbers allocates them in this order.
export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "bill",
  "credit_note",
  "debit_note",
  "payment",
  "refund",
];

export const DEFAULT_PREFIXES: Record<DocumentKind, string> = {
  bill: "MB",
  credit_note: "MC",
  debit_note: "MD",
  payment: "MP",
  refund: "MR",
};

// Six digits up to 999,999; seven unpadded digits still fit the 16-character GST limit.
const MAX_SEQ = 9_999_999;

export function formatDocumentNumber(prefix: string, financialYear: string, seq: number): string {
  return `${prefix}/${financialYear}/${String(seq).padStart(6, "0")}`;
}

export interface AllocatedNumber {
  number: string;
  prefix: string;
  seq: number;
  financialYear: string;
}

export interface SeriesEntry {
  kind: DocumentKind;
  prefix: string;
  nextSeq: number;
  firstUsedAt: Date | null;
  frozen: boolean;
  saved: boolean;
}

interface YearInput {
  financialYear: string;
  actorId: string;
}

// Bill, Note, Payment and Refund numbers. Allocation runs inside the caller's transaction, so a
// rollback gives the number back. Callers allocate every number before locking a Customer row.
export class DocumentNumberService {
  public async ensureFinancialYear(
    executor: DbExecutor,
    input: YearInput,
  ): Promise<DocumentKind[]> {
    assertFinancialYear(input.financialYear);
    return insertMissingSeries(executor, { ...input, prefixes: DEFAULT_PREFIXES });
  }

  public async lockSeriesRow(
    executor: DbExecutor,
    input: YearInput & { kind: DocumentKind },
  ): Promise<SelectDocumentNumberSeries> {
    let row = await lockSeriesRow(executor, input);
    if (!row) {
      // A year's rows are created in their own short transaction, so the caller's transaction never
      // holds uncommitted rows for the other four kinds (different series must not block each other).
      await runInTransaction((tx) => this.ensureFinancialYear(tx, input));
      row = await lockSeriesRow(executor, input);
    }
    if (!row) throw internalError(`Series ${input.kind} ${input.financialYear} missing`);
    return row;
  }

  public async allocate(
    executor: DbExecutor,
    input: YearInput & { kind: DocumentKind },
  ): Promise<AllocatedNumber> {
    const series = await this.lockSeriesRow(executor, input);
    if (series.nextSeq > MAX_SEQ) {
      throw conflict(`The ${input.kind} series for ${input.financialYear} has run out of numbers`);
    }
    await markSeriesUsed(executor, { seriesId: series.id, actorId: input.actorId });
    return {
      number: formatDocumentNumber(series.prefix, input.financialYear, series.nextSeq),
      prefix: series.prefix,
      seq: series.nextSeq,
      financialYear: input.financialYear,
    };
  }

  // Always five entries; a kind with no row yet shows its default and `saved: false`. Never inserts.
  public async getSeries(financialYear: string, executor?: DbExecutor): Promise<SeriesEntry[]> {
    assertFinancialYear(financialYear);
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
