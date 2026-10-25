import { eq } from "drizzle-orm";

import { db } from "../../index";
import { gstCreditNoteDeadlinesTable, type SelectGstCreditNoteDeadline } from "../../schema";
import type { DbExecutor } from "../shared/executor";

export async function getGstCreditNoteDeadlineRow(
  financialYear: string,
  executor: DbExecutor = db,
): Promise<SelectGstCreditNoteDeadline | undefined> {
  const [row] = await executor
    .select()
    .from(gstCreditNoteDeadlinesTable)
    .where(eq(gstCreditNoteDeadlinesTable.financialYear, financialYear));
  return row;
}
