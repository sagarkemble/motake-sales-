import { db } from "../../index";

// The shared database handle or an open transaction, so a write and its audit row can commit
// together.
export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function runInTransaction<T>(work: (transaction: DbExecutor) => Promise<T>): Promise<T> {
  return db.transaction((transaction) => work(transaction));
}
