import { randomUUID } from "node:crypto";

import { db } from "@repo/database";
import {
  applyBalanceChange,
  findBillDebit,
  findBillForPosting,
  findFirstPosting,
  findLedgerEntryForNote,
  findNoteForPosting,
  findPaymentForPosting,
  findRefundForPosting,
  getStoredBalance,
  hasOpeningBalance,
  insertLedgerEntry,
  listBalanceMismatches,
  lockLiveCustomerBalance,
  setStoredBalance,
  sumLedgerForCustomer,
  type BalanceMismatch,
} from "@repo/database/queries/ledger";
import type { DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { InsertLedgerEntry } from "@repo/database/schema";

import { badRequest, conflict, notFound } from "../errors";
import { recordAudit } from "../shared/audit";
import {
  openingBalanceInputSchema,
  postInputSchema,
  rebuildBalanceInputSchema,
  type Balance,
  type BalanceCheck,
  type BalanceRebuild,
  type BalanceState,
  type OpeningBalanceInput,
  type ParsedPostInput,
  type PostInput,
  type PostResult,
  type RebuildBalanceInput,
} from "./model";

// What a post resolved to before it writes the Ledger row.
interface Entry {
  id?: string;
  entryType: PostResult["entryType"];
  side: PostResult["side"];
  amountPaise: number;
  reason: string | null;
  links: Pick<InsertLedgerEntry, "billId" | "paymentId" | "noteId" | "refundId">;
}

function toBalance(balancePaise: number): Balance {
  const state: BalanceState =
    balancePaise > 0 ? "pending" : balancePaise < 0 ? "advance" : "settled";
  return { balancePaise, state, amountPaise: Math.abs(balancePaise) };
}

function assertSameCustomer(paperCustomerId: string, customerId: string, paper: string): void {
  if (paperCustomerId !== customerId) throw badRequest(`This ${paper} belongs to another Customer`);
}

// The money core's Ledger: the only writer of ledger_entries and customers.balance_paise. Posts run
// inside the caller's transaction; the caller audits its own action and sends no WhatsApp before
// commit. Lock order: number series first, then the Customer row, then papers and posts.
class LedgerService {
  public async post(input: PostInput, executor: DbExecutor): Promise<PostResult> {
    const parsedInput = postInputSchema.parse(input);
    // Locked before the "already posted" checks, so two posts of one paper cannot both pass them.
    await this.lockBalance(parsedInput.customerId, executor);
    const entry = await this.resolveEntry(parsedInput, executor);
    return this.writeEntry(parsedInput, entry, executor);
  }

  // Once per Customer.
  public async setOpeningBalance(
    input: OpeningBalanceInput,
    executor: DbExecutor = db,
  ): Promise<PostResult> {
    const parsedInput = openingBalanceInputSchema.parse(input);
    return executor.transaction(async (transaction) => {
      await this.lockBalance(parsedInput.customerId, transaction);
      if (await hasOpeningBalance(parsedInput.customerId, transaction)) {
        throw conflict("This Customer already has an Opening balance");
      }
      const result = await this.writeEntry(
        parsedInput,
        {
          entryType: "opening_balance",
          side: parsedInput.direction === "pending" ? "debit" : "credit",
          amountPaise: parsedInput.amountPaise,
          reason: parsedInput.reason,
          links: {},
        },
        transaction,
      );
      await recordAudit(
        {
          actorId: parsedInput.actorId,
          action: "opening_set",
          entityType: "customer",
          entityId: parsedInput.customerId,
          customerId: parsedInput.customerId,
          reason: parsedInput.reason,
          payload: { direction: parsedInput.direction, amountPaise: parsedInput.amountPaise },
        },
        transaction,
      );
      return result;
    });
  }

  // The stored copy, as Pending / Advance / Settled.
  public async getBalance(customerId: string, executor: DbExecutor = db): Promise<Balance> {
    const balancePaise = await getStoredBalance(customerId, executor);
    if (balancePaise === undefined) throw notFound(`Customer ${customerId} not found`);
    return toBalance(balancePaise);
  }

  // Locks the live Customer row FOR UPDATE, for callers that decide what to post from the Balance.
  public async lockBalance(customerId: string, executor: DbExecutor): Promise<Balance> {
    const balancePaise = await lockLiveCustomerBalance(customerId, executor);
    if (balancePaise === undefined) throw notFound(`Customer ${customerId} not found`);
    return toBalance(balancePaise);
  }

  // Reads both sides with the Customer row locked, so a post committing in between cannot show a
  // false mismatch.
  public async checkBalance(customerId: string, executor: DbExecutor = db): Promise<BalanceCheck> {
    return executor.transaction(async (transaction) => {
      const { balancePaise: storedPaise } = await this.lockBalance(customerId, transaction);
      const ledgerPaise = await sumLedgerForCustomer(customerId, transaction);
      return { storedPaise, ledgerPaise, matches: storedPaise === ledgerPaise };
    });
  }

  public async findBalanceMismatches(executor: DbExecutor = db): Promise<BalanceMismatch[]> {
    return listBalanceMismatches(executor);
  }

  // Sets the stored copy to the Ledger sum; never touches Ledger rows. Audited only when it changed.
  public async rebuildBalance(
    input: RebuildBalanceInput,
    executor: DbExecutor = db,
  ): Promise<BalanceRebuild> {
    const parsedInput = rebuildBalanceInputSchema.parse(input);
    return executor.transaction(async (transaction) => {
      const { balancePaise: beforePaise } = await this.lockBalance(
        parsedInput.customerId,
        transaction,
      );
      const afterPaise = await sumLedgerForCustomer(parsedInput.customerId, transaction);
      if (afterPaise === beforePaise) return { changed: false, beforePaise, afterPaise };
      await setStoredBalance(
        { customerId: parsedInput.customerId, balancePaise: afterPaise },
        transaction,
      );
      await recordAudit(
        {
          actorId: parsedInput.actorId,
          action: "corrected",
          entityType: "customer",
          entityId: parsedInput.customerId,
          customerId: parsedInput.customerId,
          reason: parsedInput.reason,
          payload: { balancePaise: { from: beforePaise, to: afterPaise } },
        },
        transaction,
      );
      return { changed: true, beforePaise, afterPaise };
    });
  }

  // Reads the linked paper (already inserted or updated by the caller) for side, amount and reason.
  private async resolveEntry(input: ParsedPostInput, executor: DbExecutor): Promise<Entry> {
    switch (input.entryType) {
      case "bill": {
        const bill = await findBillForPosting(input.billId, executor);
        if (!bill) throw notFound(`Bill ${input.billId} not found`);
        // An office Bill has no order; its own debit is what ties it to the Customer.
        if (bill.orderCustomerId)
          assertSameCustomer(bill.orderCustomerId, input.customerId, "Bill");
        if (await findBillDebit(bill.id, executor)) throw conflict("This Bill is already debited");
        return {
          entryType: "bill",
          side: "debit",
          amountPaise: bill.totalPaise,
          reason: input.reason || null,
          links: { billId: bill.id },
        };
      }
      case "payment": {
        const payment = await findPaymentForPosting(input.paymentId, executor);
        if (!payment) throw notFound(`Payment ${input.paymentId} not found`);
        assertSameCustomer(payment.customerId, input.customerId, "Payment");
        if (await findFirstPosting({ paymentId: payment.id }, executor)) {
          throw conflict("This Payment is already posted");
        }
        return {
          entryType: "payment",
          side: "credit",
          amountPaise: payment.amountKeptPaise,
          reason: input.reason || null,
          links: { paymentId: payment.id },
        };
      }
      case "payment_adjusted": {
        const payment = await findPaymentForPosting(input.paymentId, executor);
        if (!payment) throw notFound(`Payment ${input.paymentId} not found`);
        assertSameCustomer(payment.customerId, input.customerId, "Payment");
        return {
          entryType: "payment_adjusted",
          side: input.differencePaise > 0 ? "credit" : "debit",
          amountPaise: Math.abs(input.differencePaise),
          reason: input.reason,
          links: { paymentId: payment.id },
        };
      }
      case "refund": {
        const refund = await findRefundForPosting(input.refundId, executor);
        if (!refund) throw notFound(`Refund ${input.refundId} not found`);
        assertSameCustomer(refund.customerId, input.customerId, "Refund");
        if (await findFirstPosting({ refundId: refund.id }, executor)) {
          throw conflict("This Refund is already posted");
        }
        return {
          entryType: "refund",
          side: "debit",
          amountPaise: refund.amountPaise,
          reason: refund.reason,
          links: { refundId: refund.id },
        };
      }
      case "refund_adjusted": {
        const refund = await findRefundForPosting(input.refundId, executor);
        if (!refund) throw notFound(`Refund ${input.refundId} not found`);
        assertSameCustomer(refund.customerId, input.customerId, "Refund");
        return {
          entryType: "refund_adjusted",
          side: input.differencePaise > 0 ? "debit" : "credit",
          amountPaise: Math.abs(input.differencePaise),
          reason: input.reason,
          links: { refundId: refund.id },
        };
      }
      case "credit_note":
      case "debit_note": {
        const note = await findNoteForPosting(input.noteId, executor);
        if (!note) throw notFound(`Note ${input.noteId} not found`);
        const noteEntryType = note.kind === "debit_note" ? "debit_note" : "credit_note";
        if (input.entryType !== noteEntryType) {
          throw badRequest(`This Note is a ${note.kind}, not a ${input.entryType}`);
        }
        const bill = await findBillForPosting(note.billId, executor);
        const noteCustomerId =
          bill?.orderCustomerId ?? (await findBillDebit(note.billId, executor))?.customerId;
        if (!noteCustomerId) throw badRequest("This Note's Bill has no Customer");
        assertSameCustomer(noteCustomerId, input.customerId, "Note");
        if (await findLedgerEntryForNote(note.id, executor)) {
          throw conflict("This Note is already posted");
        }
        return {
          // The Note already carries the id of its one Ledger row (deferred FK pair).
          id: note.ledgerEntryId,
          entryType: noteEntryType,
          side: noteEntryType === "debit_note" ? "debit" : "credit",
          amountPaise: note.amountPaise,
          reason: note.reason,
          links: { noteId: note.id },
        };
      }
    }
  }

  private async writeEntry(
    input: { customerId: string; actorId: string; gatepassId?: string | null; occurredAt?: Date },
    entry: Entry,
    executor: DbExecutor,
  ): Promise<PostResult> {
    // The paper's own amount, e.g. a Payment where nothing was kept.
    if (!Number.isInteger(entry.amountPaise) || entry.amountPaise <= 0) {
      throw badRequest("A Ledger amount must be a positive whole number of paise");
    }
    const deltaPaise = entry.side === "debit" ? entry.amountPaise : -entry.amountPaise;
    const balanceAfterPaise = await applyBalanceChange(
      { customerId: input.customerId, deltaPaise },
      executor,
    );
    if (balanceAfterPaise === undefined) throw notFound(`Customer ${input.customerId} not found`);
    // Checked with the Customer row locked, so two Refunds at once cannot both pass.
    const isRefundDebit =
      (entry.entryType === "refund" || entry.entryType === "refund_adjusted") &&
      entry.side === "debit";
    if (isRefundDebit && balanceAfterPaise > 0) throw conflict("Refund cannot exceed Advance");

    const occurredAt = input.occurredAt ?? new Date();
    try {
      const row = await insertLedgerEntry(
        {
          id: entry.id ?? randomUUID(),
          customerId: input.customerId,
          entryType: entry.entryType,
          side: entry.side,
          amountPaise: entry.amountPaise,
          occurredAt,
          actorId: input.actorId,
          gatepassId: input.gatepassId ?? null,
          reason: entry.reason,
          ...entry.links,
        },
        executor,
      );
      return {
        entryId: row.id,
        entryType: row.entryType,
        side: row.side,
        amountPaise: row.amountPaise,
        balanceBeforePaise: balanceAfterPaise - deltaPaise,
        balanceAfterPaise,
        occurredAt: row.occurredAt,
      };
    } catch (error) {
      if (violatedUniqueConstraint(error)) throw conflict("This paper is already posted");
      throw error;
    }
  }
}

export default LedgerService;
export type { Balance, BalanceMismatch, BalanceState, OpeningBalanceInput, PostInput, PostResult };
