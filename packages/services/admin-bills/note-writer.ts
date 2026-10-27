import { randomUUID } from "node:crypto";

import { insertNote, insertNoteLines } from "@repo/database/queries/ledger";
import type { DbExecutor } from "@repo/database/queries/shared/executor";
import type { SelectNote, SelectSellerSettings } from "@repo/database/schema";

import LedgerService, { type PostResult } from "../ledger";
import type { NoteDraft } from "../shared/bill-arithmetic";
import type { NoteOutcome } from "../shared/bill-events";

const ledgerService = new LedgerService();

export interface WriteNoteInput {
  draft: NoteDraft;
  // MC or MD, allocated by the caller (FY of `issuedOn`) before any Customer lock.
  number: string;
  billId: string;
  // The version the Note lines point at (items[].id = each line's id), unless `lineVersionIds`
  // names another version for a line (db-decisions/0006: the pair must exist in that snapshot).
  billVersionId: string;
  lineVersionIds?: ReadonlyMap<string, string>;
  customerId: string;
  actorId: string;
  issuedOn: string;
  reason: string;
  returnOrDamageOn: string | null;
  seller: SelectSellerSettings;
  // Raise Note's client key (db-decisions/0015); none for Correct and Cancel.
  idempotencyKey?: string;
}

export interface WrittenNote {
  note: SelectNote;
  posted: PostResult;
  outcome: NoteOutcome;
}

// The one Note writer, for Correct, Cancel and Raise Note, inside the caller's transaction. Spec
// B's Note ↔ Ledger pair: the Ledger row id is made first and stored on the Note, then B's post
// writes that row from the Note (kind, amount, reason). The deferred FK pair is checked at commit.
// No audit row, no PDF (Spec L draws it after commit).
export async function writeNote(input: WriteNoteInput, executor: DbExecutor): Promise<WrittenNote> {
  const note = await insertNote(
    {
      kind: input.draft.kind,
      number: input.number,
      billId: input.billId,
      issuedOn: input.issuedOn,
      reason: input.reason,
      returnOrDamageOn: input.returnOrDamageOn,
      amountPaise: input.draft.amountPaise,
      cgstPaise: input.draft.cgstPaise,
      sgstPaise: input.draft.sgstPaise,
      igstPaise: input.draft.igstPaise,
      sellerLegalName: input.seller.legalName,
      sellerAddress: input.seller.address,
      sellerGstin: input.seller.gstin,
      ledgerEntryId: randomUUID(),
      idempotencyKey: input.idempotencyKey ?? null,
    },
    executor,
  );
  await insertNoteLines(
    input.draft.lines.map((line) => ({
      noteId: note.id,
      billVersionId: input.lineVersionIds?.get(line.lineId) ?? input.billVersionId,
      snapshotLineId: line.lineId,
      quantity: line.quantity,
      amountPaise: line.amountPaise,
      cgstPaise: line.cgstPaise,
      sgstPaise: line.sgstPaise,
      igstPaise: line.igstPaise,
    })),
    executor,
  );
  const posted = await ledgerService.post(
    {
      entryType: note.kind === "debit_note" ? "debit_note" : "credit_note",
      noteId: note.id,
      customerId: input.customerId,
      actorId: input.actorId,
    },
    executor,
  );
  return {
    note,
    posted,
    outcome: {
      noteId: note.id,
      number: note.number,
      kind: note.kind,
      amountPaise: note.amountPaise,
    },
  };
}
