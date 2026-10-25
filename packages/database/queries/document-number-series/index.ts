import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../../index";
import { documentNumberSeriesTable, type SelectDocumentNumberSeries } from "../../schema";
import type { DbExecutor } from "../shared/executor";

export type DocumentKind = SelectDocumentNumberSeries["kind"];

// Inserts the series rows that are missing for a financial year; existing rows are left alone.
// Returns the kinds it inserted.
export async function insertMissingSeries(
  input: { financialYear: string; actorId: string; prefixes: Record<DocumentKind, string> },
  executor: DbExecutor = db,
): Promise<DocumentKind[]> {
  const inserted = await executor
    .insert(documentNumberSeriesTable)
    .values(
      (Object.entries(input.prefixes) as [DocumentKind, string][]).map(([kind, prefix]) => ({
        financialYear: input.financialYear,
        kind,
        prefix,
        nextSeq: 1,
        updatedBy: input.actorId,
      })),
    )
    .onConflictDoNothing({
      target: [documentNumberSeriesTable.financialYear, documentNumberSeriesTable.kind],
    })
    .returning({ kind: documentNumberSeriesTable.kind });
  return inserted.map((row) => row.kind);
}

export async function lockSeriesRow(
  input: { financialYear: string; kind: DocumentKind },
  executor: DbExecutor = db,
): Promise<SelectDocumentNumberSeries | undefined> {
  const [row] = await executor
    .select()
    .from(documentNumberSeriesTable)
    .where(
      and(
        eq(documentNumberSeriesTable.financialYear, input.financialYear),
        eq(documentNumberSeriesTable.kind, input.kind),
      ),
    )
    .for("update");
  return row;
}

// Moves the series on by one number and freezes its prefix on first use.
export async function markSeriesUsed(
  input: { seriesId: string; actorId: string },
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .update(documentNumberSeriesTable)
    .set({
      nextSeq: sql`${documentNumberSeriesTable.nextSeq} + 1`,
      firstUsedAt: sql`COALESCE(${documentNumberSeriesTable.firstUsedAt}, now())`,
      updatedBy: input.actorId,
    })
    .where(eq(documentNumberSeriesTable.id, input.seriesId));
}

export async function listSeriesForYear(
  financialYear: string,
  executor: DbExecutor = db,
): Promise<SelectDocumentNumberSeries[]> {
  return executor
    .select()
    .from(documentNumberSeriesTable)
    .where(eq(documentNumberSeriesTable.financialYear, financialYear))
    .orderBy(asc(documentNumberSeriesTable.kind));
}
