import { randomUUID } from "node:crypto";

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
} from "@repo/database/queries/money/ledger";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { InsertLedgerEntry, SelectLedgerEntry } from "@repo/database/schema";

import { badRequest, conflict, notFound } from "../errors";
import { recordAudit } from "../shared/audit";

export type { BalanceMismatch };

type EntryType = SelectLedgerEntry["entryType"];
type Side = SelectLedgerEntry["side"];

interface PostCommon {
  customerId: string;
  actorId: string;
  // Only when a salesman posts against their Active GatePass.
  gatepassId?: string | null;
  occurredAt?: Date;
}

export type PostInput = PostCommon &
  (
    | { entryType: "bill"; billId: string; reason?: string }
    | { entryType: "payment"; paymentId: string; reason?: string }
    // "note" lets the core pick credit_note or debit_note from the Note's kind.
    | { entryType: "note" | "credit_note" | "debit_note"; noteId: string }
    // Signed difference: new kept minus old kept.
    | { entryType: "payment_adjusted"; paymentId: string; differencePaise: number; reason: string }
    | { entryType: "refund"; refundId: string }
    // Signed difference: new Refund minus old Refund.
    | { entryType: "refund_adjusted"; refundId: string; differencePaise: number; reason: string }
  );

export interface PostResult {
  entryId: string;
  entryType: EntryType;
  side: Side;
  amountPaise: number;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  occurredAt: Date;
}

export type BalanceState = "pending" | "advance" | "settled";

export interface Balance {
  balancePaise: number;
  state: BalanceState;
  amountPaise: number;
}

export interface OpeningBalanceInput {
  customerId: string;
  direction: "pending" | "advance";
  amountPaise: number;
  reason: string;
  actorId: string;
  occurredAt?: Date;
}

// What a post resolved to before it touches the Customer row.
interface Entry {
  id?: string;
  entryType: EntryType;
  side: Side;
  amountPaise: number;
  reason: string | null;
  links: Pick<InsertLedgerEntry, "billId" | "paymentId" | "noteId" | "refundId">;
}

function toBalance(balancePaise: number): Balance {
  const state: BalanceState =
    balancePaise > 0 ? "pending" : balancePaise < 0 ? "advance" : "settled";
  return { balancePaise, state, amountPaise: Math.abs(balancePaise) };
}

function requiredReason(reason: string | undefined): string {
  const trimmed = reason?.trim();
  if (!trimmed) throw badRequest("A reason is required");
  return trimmed;
}

function assertPositivePaise(amountPaise: number): void {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw badRequest("A Ledger amount must be a positive whole number of paise");
  }
}

function assertSameCustomer(paperCustomerId: string, customerId: string, paper: string): void {
  if (paperCustomerId !== customerId) throw badRequest(`This ${paper} belongs to another Customer`);
}

// The money core's Ledger: the only writer of ledger_entries and customers.balance_paise. Posts run
// inside the caller's transaction; the caller audits its own action and sends no WhatsApp before
// commit. Lock order: number series first, then the Customer row, then papers and posts.
export class LedgerService {
  public async post(executor: DbExecutor, input: PostInput): Promise<PostResult> {
    // Locked before the "already posted" checks, so two posts of one paper cannot both pass them.
    await this.lockBalance(executor, input.customerId);
    const entry = await this.resolveEntry(executor, input);
    return this.writeEntry(executor, input, entry);
  }

  // Once per Customer. A complete procedure: opens its own transaction unless given one.
  public async setOpeningBalance(
    input: OpeningBalanceInput,
    executor?: DbExecutor,
  ): Promise<PostResult> {
    const reason = requiredReason(input.reason);
    assertPositivePaise(input.amountPaise);
    const work = async (tx: DbExecutor) => {
      await this.lockBalance(tx, input.customerId);
      if (await hasOpeningBalance(tx, input.customerId)) {
        throw conflict("This Customer already has an Opening balance");
      }
      const result = await this.writeEntry(tx, input, {
        entryType: "opening_balance",
        side: input.direction === "pending" ? "debit" : "credit",
        amountPaise: input.amountPaise,
        reason,
        links: {},
      });
      await recordAudit(
        {
          actorId: input.actorId,
          action: "opening_set",
          entityType: "customer",
          entityId: input.customerId,
          customerId: input.customerId,
          reason,
          payload: { direction: input.direction, amountPaise: input.amountPaise },
        },
        tx,
      );
      return result;
    };
    return executor ? work(executor) : runInTransaction(work);
  }

  // The stored copy, as Pending / Advance / Settled.
  public async getBalance(customerId: string, executor?: DbExecutor): Promise<Balance> {
    const balancePaise = await getStoredBalance(customerId, executor);
    if (balancePaise === undefined) throw notFound(`Customer ${customerId} not found`);
    return toBalance(balancePaise);
  }

  // Locks the live Customer row FOR UPDATE, for callers that decide what to post from the Balance.
  public async lockBalance(executor: DbExecutor, customerId: string): Promise<Balance> {
    const balancePaise = await lockLiveCustomerBalance(executor, customerId);
    if (balancePaise === undefined) throw notFound(`Customer ${customerId} not found`);
    return toBalance(balancePaise);
  }

  // Reads both sides with the Customer row locked, so a post committing in between cannot show a
  // false mismatch.
  public async checkBalance(
    customerId: string,
    executor?: DbExecutor,
  ): Promise<{ storedPaise: number; ledgerPaise: number; matches: boolean }> {
    const work = async (tx: DbExecutor) => {
      const { balancePaise: storedPaise } = await this.lockBalance(tx, customerId);
      const ledgerPaise = await sumLedgerForCustomer(customerId, tx);
      return { storedPaise, ledgerPaise, matches: storedPaise === ledgerPaise };
    };
    return executor ? work(executor) : runInTransaction(work);
  }

  public async findBalanceMismatches(executor?: DbExecutor): Promise<BalanceMismatch[]> {
    return listBalanceMismatches(executor);
  }

  // Sets the stored copy to the Ledger sum; never touches Ledger rows. Audited only when it changed.
  public async rebuildBalance(
    input: { customerId: string; actorId: string; reason: string },
    executor?: DbExecutor,
  ): Promise<{ changed: boolean; beforePaise: number; afterPaise: number }> {
    const reason = requiredReason(input.reason);
    const work = async (tx: DbExecutor) => {
      const { balancePaise: beforePaise } = await this.lockBalance(tx, input.customerId);
      const afterPaise = await sumLedgerForCustomer(input.customerId, tx);
      if (afterPaise === beforePaise) return { changed: false, beforePaise, afterPaise };
      await setStoredBalance(tx, { customerId: input.customerId, balancePaise: afterPaise });
      await recordAudit(
        {
          actorId: input.actorId,
          action: "corrected",
          entityType: "customer",
          entityId: input.customerId,
          customerId: input.customerId,
          reason,
          payload: { balancePaise: { from: beforePaise, to: afterPaise } },
        },
        tx,
      );
      return { changed: true, beforePaise, afterPaise };
    };
    return executor ? work(executor) : runInTransaction(work);
  }

  // Reads the linked paper (already inserted or updated by the caller) for side, amount and reason.
  private async resolveEntry(executor: DbExecutor, input: PostInput): Promise<Entry> {
    switch (input.entryType) {
      case "bill": {
        const bill = await findBillForPosting(executor, input.billId);
        if (!bill) throw notFound(`Bill ${input.billId} not found`);
        // An office Bill has no order; its own debit is what ties it to the Customer.
        if (bill.orderCustomerId)
          assertSameCustomer(bill.orderCustomerId, input.customerId, "Bill");
        if (await findBillDebit(executor, bill.id)) throw conflict("This Bill is already debited");
        return {
          entryType: "bill",
          side: "debit",
          amountPaise: bill.totalPaise,
          reason: input.reason?.trim() || null,
          links: { billId: bill.id },
        };
      }
      case "payment": {
        const payment = await findPaymentForPosting(executor, input.paymentId);
        if (!payment) throw notFound(`Payment ${input.paymentId} not found`);
        assertSameCustomer(payment.customerId, input.customerId, "Payment");
        if (await findFirstPosting(executor, { paymentId: payment.id })) {
          throw conflict("This Payment is already posted");
        }
        return {
          entryType: "payment",
          side: "credit",
          amountPaise: payment.amountKeptPaise,
          reason: input.reason?.trim() || null,
          links: { paymentId: payment.id },
        };
      }
      case "payment_adjusted": {
        const reason = requiredReason(input.reason);
        const payment = await findPaymentForPosting(executor, input.paymentId);
        if (!payment) throw notFound(`Payment ${input.paymentId} not found`);
        assertSameCustomer(payment.customerId, input.customerId, "Payment");
        return {
          entryType: "payment_adjusted",
          side: input.differencePaise > 0 ? "credit" : "debit",
          amountPaise: Math.abs(input.differencePaise),
          reason,
          links: { paymentId: payment.id },
        };
      }
      case "refund": {
        const refund = await findRefundForPosting(executor, input.refundId);
        if (!refund) throw notFound(`Refund ${input.refundId} not found`);
        assertSameCustomer(refund.customerId, input.customerId, "Refund");
        if (await findFirstPosting(executor, { refundId: refund.id })) {
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
        const reason = requiredReason(input.reason);
        const refund = await findRefundForPosting(executor, input.refundId);
        if (!refund) throw notFound(`Refund ${input.refundId} not found`);
        assertSameCustomer(refund.customerId, input.customerId, "Refund");
        return {
          entryType: "refund_adjusted",
          side: input.differencePaise > 0 ? "debit" : "credit",
          amountPaise: Math.abs(input.differencePaise),
          reason,
          links: { refundId: refund.id },
        };
      }
      case "note":
      case "credit_note":
      case "debit_note": {
        const note = await findNoteForPosting(executor, input.noteId);
        if (!note) throw notFound(`Note ${input.noteId} not found`);
        const entryType = note.kind === "debit_note" ? "debit_note" : "credit_note";
        if (input.entryType !== "note" && input.entryType !== entryType) {
          throw badRequest(`This Note is a ${note.kind}, not a ${input.entryType}`);
        }
        const bill = await findBillForPosting(executor, note.billId);
        const noteCustomerId =
          bill?.orderCustomerId ?? (await findBillDebit(executor, note.billId))?.customerId;
        if (!noteCustomerId) throw badRequest("This Note's Bill has no Customer");
        assertSameCustomer(noteCustomerId, input.customerId, "Note");
        if (await findLedgerEntryForNote(executor, note.id)) {
          throw conflict("This Note is already posted");
        }
        return {
          // The Note already carries the id of its one Ledger row (deferred FK pair).
          id: note.ledgerEntryId,
          entryType,
          side: entryType === "debit_note" ? "debit" : "credit",
          amountPaise: note.amountPaise,
          reason: note.reason,
          links: { noteId: note.id },
        };
      }
    }
  }

  private async writeEntry(
    executor: DbExecutor,
    input: PostCommon,
    entry: Entry,
  ): Promise<PostResult> {
    assertPositivePaise(entry.amountPaise);
    const deltaPaise = entry.side === "debit" ? entry.amountPaise : -entry.amountPaise;
    const balanceAfterPaise = await applyBalanceChange(executor, {
      customerId: input.customerId,
      deltaPaise,
    });
    if (balanceAfterPaise === undefined) throw notFound(`Customer ${input.customerId} not found`);
    // Checked with the Customer row locked, so two Refunds at once cannot both pass.
    const isRefundDebit =
      (entry.entryType === "refund" || entry.entryType === "refund_adjusted") &&
      entry.side === "debit";
    if (isRefundDebit && balanceAfterPaise > 0) throw conflict("Refund cannot exceed Advance");

    const occurredAt = input.occurredAt ?? new Date();
    try {
      const row = await insertLedgerEntry(executor, {
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
      });
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
