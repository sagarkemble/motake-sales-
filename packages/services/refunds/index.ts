import { getBalanceThroughLedgerEntry } from "@repo/database/queries/ledger";
import { lockCustomerRow } from "@repo/database/queries/customers";
import {
  getLatestRefundEvent,
  getPostedRefundEvent,
  getRefundByIdempotencyKey,
  getRefundPaperRow,
  insertRefund,
  insertRefundEvent,
  listRefundEventsWithActor,
  lockRefundRow,
  updateRefund,
} from "@repo/database/queries/refunds";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectRefund } from "@repo/database/schema";
import { formatPaise } from "@repo/pdf";

import DocumentNumberService from "../document-numbers";
import { internalError, ledgerRefusal, notFound } from "../errors";
import LedgerService, { type Balance } from "../ledger";
import { assertCustomerActive } from "../shared/checkout";
import { financialYearOfInstant } from "../shared/financial-year";
import {
  noAdminPaymentListener,
  notifyAdminPaymentOutcome,
  type AdminPaymentListener,
  type RefundAddedOutcome,
  type RefundCorrectedOutcome,
} from "../shared/payment-events";
import {
  addRefundInputSchema,
  correctRefundInputSchema,
  type AddRefundInput,
  type AddRefundResult,
  type CorrectRefundInput,
  type CorrectRefundResult,
  type ParsedAddRefundInput,
  type RefundPaper,
  type RefundPaperEvent,
} from "./model";

const refundIdempotencyConstraint = "refunds_idempotency_key_unique";

// Rolls back an Add whose key another call already posted.
class SameKeyAlreadyPosted extends Error {}

const keyReusedRefusal = () =>
  ledgerRefusal(
    "idempotency_key_reused",
    "This key was already used for a different Refund. Try again.",
  );

const staleCorrectRefusal = () =>
  ledgerRefusal("stale_version", "Someone else corrected this Refund first. Reload it.");

const nothingChangedRefusal = () =>
  ledgerRefusal(
    "nothing_changed",
    "Nothing changed. Change the amount, mode or reference, or close Correct.",
  );

const notInAdvanceRefusal = (balance: Balance) =>
  ledgerRefusal(
    "not_in_advance",
    "This Customer is not in Advance. A Refund is paid only out of Advance.",
    { balancePaise: balance.balancePaise },
  );

// The Advance is −Balance; Pending or Settled has none.
const advanceOf = (balance: Balance) => (balance.state === "advance" ? balance.amountPaise : 0);

// A transaction's result plus what it tells Spec J after commit.
interface Run<Result, Outcome> {
  result: Result;
  outcome: Outcome;
}

// Refunds (Spec H): money Motake paid back out of a Customer's Advance, recorded by Admin after the
// external payout; the app moves no money. Add, the Refund paper and Correct (admin only, checked
// at the router). Lock order: the MR series (Add), or the Refund row (Correct), then the Customer
// (Spec B's lockBalance and posting), so two Refunds cannot spend the same Advance.
class RefundService {
  private readonly documentNumbers = new DocumentNumberService();
  private readonly ledgerService = new LedgerService();

  // Spec J's listener, called once after each Add or Correct commits.
  public constructor(private readonly afterCommit: AdminPaymentListener = noAdminPaymentListener) {}

  // Allowed only while the Customer is in Advance and never above it, checked on the Balance under
  // the Customer lock. Posts the Refund Debit with the Refund's reason. A retry with the same key
  // returns the first Refund and the Balance after it.
  public async addRefund(actorProfileId: string, input: AddRefundInput): Promise<AddRefundResult> {
    const parsedInput = addRefundInputSchema.parse(input);
    const firstRefund = await getRefundByIdempotencyKey(parsedInput.idempotencyKey);
    if (firstRefund) return this.replayAddRefund(firstRefund, parsedInput);

    let run: Run<AddRefundResult, RefundAddedOutcome>;
    try {
      run = await runInTransaction(async (transaction) => {
        const now = new Date();
        const allocated = await this.documentNumbers.allocate(
          { kind: "refund", financialYear: financialYearOfInstant(now), actorId: actorProfileId },
          transaction,
        );
        const balance = await this.ledgerService.lockBalance(parsedInput.customerId, transaction);
        const occurredAt = new Date();
        if (await getRefundByIdempotencyKey(parsedInput.idempotencyKey, transaction)) {
          throw new SameKeyAlreadyPosted();
        }
        // A refusal rolls the MR number back.
        if (balance.state !== "advance") throw notInAdvanceRefusal(balance);
        if (parsedInput.amountPaise > advanceOf(balance)) {
          throw ledgerRefusal(
            "refund_above_advance",
            `A Refund cannot be more than the Advance of ${formatPaise(advanceOf(balance))}.`,
            { advancePaise: advanceOf(balance) },
          );
        }

        const refund = await insertRefund(
          {
            customerId: parsedInput.customerId,
            number: allocated.number,
            mode: parsedInput.mode,
            amountPaise: parsedInput.amountPaise,
            reference: parsedInput.reference,
            reason: parsedInput.reason,
            actorId: actorProfileId,
            occurredAt,
            idempotencyKey: parsedInput.idempotencyKey,
          },
          transaction,
        );
        const debit = await this.ledgerService.post(
          {
            entryType: "refund",
            refundId: refund.id,
            customerId: refund.customerId,
            actorId: actorProfileId,
            gatepassId: null,
            occurredAt,
          },
          transaction,
        );
        const postedEvent = await insertRefundEvent(
          {
            refundId: refund.id,
            kind: "posted",
            amountPaise: refund.amountPaise,
            previousAmountPaise: 0,
            differencePaise: refund.amountPaise,
            mode: refund.mode,
            reference: refund.reference,
            reason: refund.reason,
            correctionDate: null,
            actorId: actorProfileId,
            ledgerEntryId: debit.entryId,
            occurredAt,
          },
          transaction,
        );
        return {
          result: {
            refundId: refund.id,
            number: refund.number,
            amountPaise: refund.amountPaise,
            balancePaise: debit.balanceAfterPaise,
          },
          outcome: {
            kind: "refund_added",
            customerId: refund.customerId,
            reason: refund.reason,
            balanceAfterPaise: debit.balanceAfterPaise,
            refundId: refund.id,
            postedEventId: postedEvent.id,
            refundNumber: refund.number,
            mode: refund.mode,
            amountPaise: refund.amountPaise,
          },
        };
      });
    } catch (addError) {
      // A concurrent attempt with the same key won; this one rolled back whole, MR number included.
      if (
        addError instanceof SameKeyAlreadyPosted ||
        violatedUniqueConstraint(addError) === refundIdempotencyConstraint
      ) {
        const winner = await getRefundByIdempotencyKey(parsedInput.idempotencyKey);
        if (winner) return this.replayAddRefund(winner, parsedInput);
      }
      throw addError;
    }
    await notifyAdminPaymentOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // The Refund paper: current state, who recorded it, and every history event. Also for a
  // deactivated Customer (Correct is then off).
  public async getRefundPaper(refundId: string): Promise<RefundPaper> {
    const row = await getRefundPaperRow(refundId);
    if (!row) throw notFound(`Refund ${refundId} not found`);
    const events = await listRefundEventsWithActor(refundId);
    const latest = events.at(-1);
    if (!latest) throw internalError(`Refund ${row.refund.number} has no history`);
    const { refund, customer } = row;
    return {
      refund: {
        id: refund.id,
        number: refund.number,
        postedAt: refund.occurredAt,
        mode: refund.mode,
        amountPaise: refund.amountPaise,
        reference: refund.reference,
        reason: refund.reason,
        actorName: row.actorName,
      },
      customer: {
        id: customer.id,
        shopName: customer.shopName,
        status: customer.status,
        routeName: row.routeName,
        routeCode: row.routeCode,
      },
      events: events.map(
        ({ event, actorName }): RefundPaperEvent => ({
          id: event.id,
          kind: event.kind,
          occurredAt: event.occurredAt,
          amountPaise: event.amountPaise,
          previousAmountPaise: event.previousAmountPaise,
          differencePaise: event.differencePaise,
          mode: event.mode,
          reference: event.reference,
          reason: event.reason,
          correctionDate: event.correctionDate,
          actorName,
          ledgerEntryId: event.ledgerEntryId,
        }),
      ),
      latestEventId: latest.event.id,
      balance: await this.ledgerService.getBalance(customer.id),
      actions: { canCorrect: customer.status === "active" && !customer.deletedAt },
    };
  }

  // Fixes a wrongly recorded Refund. An amount change posts a Refund adjusted Ledger row with the
  // same MR (Debit if the amount went up, Credit if down); a raise larger than the Customer's
  // current Advance is refused. Lowering, and a mode / reference-only Correct, are never capped;
  // the latter writes the event and no Ledger row. Never touches a Bill.
  public async correctRefund(
    actorProfileId: string,
    input: CorrectRefundInput,
  ): Promise<CorrectRefundResult> {
    const parsedInput = correctRefundInputSchema.parse(input);
    const run = await runInTransaction(
      async (transaction): Promise<Run<CorrectRefundResult, RefundCorrectedOutcome>> => {
        const refund = await lockRefundRow(parsedInput.refundId, transaction);
        if (!refund) throw notFound(`Refund ${parsedInput.refundId} not found`);
        const latest = await getLatestRefundEvent(refund.id, transaction);
        if (latest?.id !== parsedInput.expectedLatestEventId) throw staleCorrectRefusal();
        const differencePaise = parsedInput.amountPaise - refund.amountPaise;
        if (
          differencePaise === 0 &&
          parsedInput.mode === refund.mode &&
          parsedInput.reference === refund.reference
        ) {
          throw nothingChangedRefusal();
        }
        if (differencePaise > 0) {
          // The raise is a new Debit inside a Balance that already holds this Refund's debit.
          const balance = await this.ledgerService.lockBalance(refund.customerId, transaction);
          if (differencePaise > advanceOf(balance)) {
            throw ledgerRefusal(
              "refund_above_advance",
              `This raises the Refund by ${formatPaise(differencePaise)}, more than the Advance of ${formatPaise(advanceOf(balance))}.`,
              { advancePaise: advanceOf(balance), increasePaise: differencePaise },
            );
          }
        }

        const now = new Date();
        // Spec B reads the Refund row already updated.
        const updated = await updateRefund(
          refund.id,
          {
            amountPaise: parsedInput.amountPaise,
            mode: parsedInput.mode,
            reference: parsedInput.reference,
          },
          transaction,
        );
        const { ledgerEntryId, balanceAfterPaise } = await this.postAdjustment(
          { refund, differencePaise, reason: parsedInput.reason, actorProfileId, now },
          transaction,
        );
        const event = await insertRefundEvent(
          {
            refundId: refund.id,
            kind: "adjusted",
            amountPaise: parsedInput.amountPaise,
            previousAmountPaise: refund.amountPaise,
            differencePaise,
            mode: parsedInput.mode,
            reference: parsedInput.reference,
            reason: parsedInput.reason,
            correctionDate: businessDateOf(now),
            actorId: actorProfileId,
            ledgerEntryId,
            occurredAt: now,
          },
          transaction,
        );
        return {
          result: {
            refundId: updated.id,
            number: updated.number,
            eventId: event.id,
            ledgerEntryId,
            amountPaise: updated.amountPaise,
            differencePaise,
            mode: updated.mode,
            reference: updated.reference,
            balancePaise: balanceAfterPaise,
          },
          outcome: {
            kind: "refund_corrected",
            customerId: refund.customerId,
            reason: parsedInput.reason,
            balanceAfterPaise,
            refundId: updated.id,
            adjustedEventId: event.id,
            refundNumber: updated.number,
            amountBeforePaise: refund.amountPaise,
            amountAfterPaise: updated.amountPaise,
            differencePaise,
            amountChanged: differencePaise !== 0,
            mode: updated.mode,
            reference: updated.reference,
          },
        };
      },
    );
    await notifyAdminPaymentOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // An amount change posts through Spec B (which locks the Customer, refuses a deactivated one and
  // re-checks "Refund cannot exceed Advance"). A mode / reference-only Correct posts nothing, so it
  // holds the Customer row itself and re-checks it is active, last in the lock order.
  private async postAdjustment(
    input: {
      refund: SelectRefund;
      differencePaise: number;
      reason: string;
      actorProfileId: string;
      now: Date;
    },
    transaction: DbExecutor,
  ): Promise<{ ledgerEntryId: string | null; balanceAfterPaise: number }> {
    const { refund } = input;
    if (input.differencePaise === 0) {
      const customer = await lockCustomerRow(refund.customerId, "share", transaction);
      assertCustomerActive(customer, refund.customerId);
      return { ledgerEntryId: null, balanceAfterPaise: customer.balancePaise };
    }
    const posted = await this.ledgerService.post(
      {
        entryType: "refund_adjusted",
        refundId: refund.id,
        customerId: refund.customerId,
        actorId: input.actorProfileId,
        gatepassId: null,
        occurredAt: input.now,
        differencePaise: input.differencePaise,
        reason: input.reason,
      },
      transaction,
    );
    return { ledgerEntryId: posted.entryId, balanceAfterPaise: posted.balanceAfterPaise };
  }

  // The first Add's result for a retried key: its amount as posted and the Balance right after its
  // Ledger debit. The same key for another Customer or amount is refused. Nothing is written or
  // sent.
  private async replayAddRefund(
    refund: SelectRefund,
    input: ParsedAddRefundInput,
  ): Promise<AddRefundResult> {
    const posted = await getPostedRefundEvent(refund.id);
    if (!posted?.ledgerEntryId) throw internalError(`Refund ${refund.number} has no Ledger row`);
    if (refund.customerId !== input.customerId || posted.amountPaise !== input.amountPaise) {
      throw keyReusedRefusal();
    }
    const balanceAfterPaise = await getBalanceThroughLedgerEntry(posted.ledgerEntryId);
    if (balanceAfterPaise === undefined) {
      throw internalError(`Refund ${refund.number} has no Ledger row`);
    }
    return {
      refundId: refund.id,
      number: refund.number,
      amountPaise: posted.amountPaise,
      balancePaise: balanceAfterPaise,
    };
  }
}

export default RefundService;
export type {
  AddRefundInput,
  AddRefundResult,
  CorrectRefundInput,
  CorrectRefundResult,
  RefundPaper,
  RefundPaperEvent,
};
