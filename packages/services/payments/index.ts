import { lockCustomerRow, getCustomerById } from "@repo/database/queries/customers";
import { getBalanceThroughLedgerEntry } from "@repo/database/queries/ledger";
import {
  getLatestPaymentEvent,
  getPaymentByIdempotencyKey,
  getPaymentPaperRow,
  getPostedPaymentEvent,
  insertPayment,
  insertPaymentEvent,
  listPaymentEventsWithActor,
  lockPaymentRow,
  updatePayment,
} from "@repo/database/queries/payments";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectPayment } from "@repo/database/schema";

import DocumentNumberService from "../document-numbers";
import { checkoutRefusal, internalError, ledgerRefusal, notFound } from "../errors";
import GatepassService from "../gatepass";
import LedgerService from "../ledger";
import {
  assertCustomerActive,
  assertCustomerOnRoute,
  noActiveGatepassRefusal,
} from "../shared/checkout";
import {
  noCheckoutListener,
  notifyAfterCommit,
  type CheckoutListener,
} from "../shared/checkout-events";
import { financialYearOfInstant } from "../shared/financial-year";
import {
  noAdminPaymentListener,
  notifyAdminPaymentOutcome,
  type AdminPaymentListener,
  type PaymentAddedOutcome,
  type PaymentCorrectedOutcome,
} from "../shared/payment-events";
import {
  addPaymentInputSchema,
  correctPaymentInputSchema,
  postPaymentInputSchema,
  recordFieldPaymentInputSchema,
  type AddPaymentInput,
  type AddPaymentResult,
  type CorrectPaymentInput,
  type CorrectPaymentResult,
  type FieldPaymentResult,
  type ParsedAddPaymentInput,
  type PaymentPaper,
  type PostedPayment,
  type PostPaymentInput,
  type RecordFieldPaymentInput,
} from "./model";
import { splitPayment, type PaymentSplit } from "./overpay";

const paymentIdempotencyConstraint = "payments_idempotency_key_unique";

const keptZeroRefusal = () =>
  checkoutRefusal(
    "field_payment_kept_zero",
    "Nothing is kept from this Payment. A field Payment must keep more than ₹0.",
  );

// Rolls back a field or Admin Payment whose key another call already posted.
class SameKeyAlreadyPosted extends Error {}

const keyReusedRefusal = () =>
  ledgerRefusal(
    "idempotency_key_reused",
    "This key was already used for a different Payment. Try again.",
  );

// Someone else corrected this Payment after the Admin opened it.
const staleCorrectRefusal = () =>
  ledgerRefusal("stale_version", "Someone else corrected this Payment first. Reload it.");

const nothingChangedRefusal = () =>
  ledgerRefusal(
    "nothing_changed",
    "Nothing changed. Change the kept amount, mode or reference, or close Correct.",
  );

// A transaction's result plus what it tells Spec J after commit.
interface Run<Result, Outcome> {
  result: Result;
  outcome: Outcome;
}

// Payments: the only writer of `payments` rows and their `posted` event. Checkout (Book Now,
// fulfil) and field Payment post here; Spec H's Admin Add Payment uses the same posting step.
// Admin also reads the Payment paper and Corrects kept, mode and reference (admin only, checked at
// the router).
class PaymentService {
  private readonly documentNumbers = new DocumentNumberService();
  private readonly gatepassService = new GatepassService();
  private readonly ledgerService = new LedgerService();

  // Spec J's listeners, called once after a field Payment, and after an Admin Add or Correct,
  // commits.
  public constructor(
    private readonly afterCommit: CheckoutListener = noCheckoutListener,
    private readonly adminAfterCommit: AdminPaymentListener = noAdminPaymentListener,
  ) {}

  // Runs in the caller's transaction, after the caller allocated the MP number (FY of
  // `occurredAt`) and locked the Customer. Inserts the Payment, credits the Ledger with the kept
  // amount and records the `posted` event linked to that credit.
  public async post(input: PostPaymentInput, executor: DbExecutor): Promise<PostedPayment> {
    const parsedInput = postPaymentInputSchema.parse(input);
    assertCustomerActive(
      await getCustomerById(parsedInput.customerId, executor),
      parsedInput.customerId,
    );
    const payment = await insertPayment(
      {
        customerId: parsedInput.customerId,
        mode: parsedInput.mode,
        amountReceivedPaise: parsedInput.receivedPaise,
        amountKeptPaise: parsedInput.keptPaise,
        amountReturnedPaise: parsedInput.returnedPaise,
        number: parsedInput.number,
        reference: parsedInput.reference ?? null,
        gatepassId: parsedInput.gatepassId ?? null,
        actorId: parsedInput.actorId,
        occurredAt: parsedInput.occurredAt,
        idempotencyKey: parsedInput.idempotencyKey,
      },
      executor,
    );
    const credit = await this.ledgerService.post(
      {
        entryType: "payment",
        paymentId: payment.id,
        customerId: parsedInput.customerId,
        actorId: parsedInput.actorId,
        gatepassId: parsedInput.gatepassId ?? null,
        occurredAt: parsedInput.occurredAt,
        reason: parsedInput.reason,
      },
      executor,
    );
    const postedEvent = await insertPaymentEvent(
      {
        paymentId: payment.id,
        kind: "posted",
        amountKeptPaise: parsedInput.keptPaise,
        previousKeptPaise: 0,
        differencePaise: parsedInput.keptPaise,
        reason: parsedInput.reason || null,
        mode: parsedInput.mode,
        reference: parsedInput.reference ?? null,
        correctionDate: null,
        actorId: parsedInput.actorId,
        ledgerEntryId: credit.entryId,
        occurredAt: parsedInput.occurredAt,
      },
      executor,
    );
    return {
      payment,
      postedEventId: postedEvent.id,
      ledgerEntryId: credit.entryId,
      balanceAfterPaise: credit.balanceAfterPaise,
    };
  }

  // Salesman money with no purchase, on a Customer on the Active GatePass Route. A retry with the
  // same key returns the first Payment and the current Balance.
  public async recordFieldPayment(
    actorSalesmanId: string,
    input: RecordFieldPaymentInput,
  ): Promise<FieldPaymentResult> {
    const parsedInput = recordFieldPaymentInputSchema.parse(input);
    const firstResult = await this.findFieldPaymentResult(parsedInput.idempotencyKey);
    if (firstResult) return firstResult;

    const splitFor = (balancePaise: number) =>
      splitPayment({
        mode: parsedInput.mode,
        receivedPaise: parsedInput.receivedPaise,
        overpay: parsedInput.overpay,
        requiredPaise: balancePaise,
      });

    let posted: PostedPayment & { split: PaymentSplit };
    try {
      posted = await runInTransaction(async (transaction) => {
        const now = new Date();
        const activeGatepass = await this.gatepassService.lockActiveGatepassForSalesman(
          actorSalesmanId,
          "share",
          transaction,
        );
        if (!activeGatepass) throw noActiveGatepassRefusal();
        const routeId = activeGatepass.route.id;

        const customer = await getCustomerById(parsedInput.customerId, transaction);
        assertCustomerOnRoute(customer, parsedInput.customerId, routeId);
        if (splitFor(customer.balancePaise).keptPaise === 0) throw keptZeroRefusal();

        const allocated = await this.documentNumbers.allocate(
          {
            kind: "payment",
            financialYear: financialYearOfInstant(now),
            actorId: actorSalesmanId,
          },
          transaction,
        );

        const lockedCustomer = await lockCustomerRow(parsedInput.customerId, "update", transaction);
        // Read under the lock, so the Ledger time follows every posting that committed while
        // this call waited; the MP's FY stays the one read before allocating.
        const occurredAt = new Date();
        // A concurrent call with the same key committed while this one waited for the Customer;
        // roll back (freeing the MP number) and show its result.
        if (await getPaymentByIdempotencyKey(parsedInput.idempotencyKey, transaction)) {
          throw new SameKeyAlreadyPosted();
        }
        assertCustomerOnRoute(lockedCustomer, parsedInput.customerId, routeId);
        const split = splitFor(lockedCustomer.balancePaise);
        if (split.keptPaise === 0) throw keptZeroRefusal();

        const result = await this.post(
          {
            customerId: parsedInput.customerId,
            mode: parsedInput.mode,
            receivedPaise: split.receivedPaise,
            keptPaise: split.keptPaise,
            returnedPaise: split.returnedPaise,
            reference: parsedInput.reference,
            gatepassId: activeGatepass.gatepass.id,
            actorId: actorSalesmanId,
            occurredAt,
            idempotencyKey: parsedInput.idempotencyKey,
            number: allocated.number,
          },
          transaction,
        );
        return { ...result, split };
      });
    } catch (fieldPaymentError) {
      // A concurrent retry with the same key won; show its result.
      if (
        fieldPaymentError instanceof SameKeyAlreadyPosted ||
        violatedUniqueConstraint(fieldPaymentError) === paymentIdempotencyConstraint
      ) {
        const winner = await this.findFieldPaymentResult(parsedInput.idempotencyKey);
        if (winner) return winner;
      }
      throw fieldPaymentError;
    }

    await notifyAfterCommit(this.afterCommit, {
      bill: null,
      payment: {
        paymentId: posted.payment.id,
        postedEventId: posted.postedEventId,
        paymentNumber: posted.payment.number,
        customerId: posted.payment.customerId,
        keptPaise: posted.split.keptPaise,
        returnedPaise: posted.split.returnedPaise,
        balanceAfterPaise: posted.balanceAfterPaise,
      },
    });
    return {
      paymentId: posted.payment.id,
      number: posted.payment.number,
      keptPaise: posted.split.keptPaise,
      returnedPaise: posted.split.returnedPaise,
      balancePaise: posted.balanceAfterPaise,
    };
  }

  // An office Payment from Ledger Add: received = kept, nothing returned, no GatePass, the Admin's
  // reason on the posted event and the Ledger credit. Anything beyond Pending becomes Advance. A
  // retry with the same key returns the first Payment and the Balance after it.
  public async addPayment(
    actorProfileId: string,
    input: AddPaymentInput,
  ): Promise<AddPaymentResult> {
    const parsedInput = addPaymentInputSchema.parse(input);
    const firstPayment = await getPaymentByIdempotencyKey(parsedInput.idempotencyKey);
    if (firstPayment) return this.replayAddPayment(firstPayment, parsedInput);

    let run: Run<AddPaymentResult, PaymentAddedOutcome>;
    try {
      run = await runInTransaction(async (transaction) => {
        const now = new Date();
        assertCustomerActive(
          await getCustomerById(parsedInput.customerId, transaction),
          parsedInput.customerId,
        );
        const allocated = await this.documentNumbers.allocate(
          { kind: "payment", financialYear: financialYearOfInstant(now), actorId: actorProfileId },
          transaction,
        );
        await this.ledgerService.lockBalance(parsedInput.customerId, transaction);
        // Read under the lock, so the Ledger time follows every posting that committed while this
        // call waited; the MP's FY stays the one read before allocating.
        const occurredAt = new Date();
        if (await getPaymentByIdempotencyKey(parsedInput.idempotencyKey, transaction)) {
          throw new SameKeyAlreadyPosted();
        }
        const posted = await this.post(
          {
            customerId: parsedInput.customerId,
            mode: parsedInput.mode,
            receivedPaise: parsedInput.keptPaise,
            keptPaise: parsedInput.keptPaise,
            returnedPaise: 0,
            reference: parsedInput.reference,
            reason: parsedInput.reason,
            gatepassId: null,
            actorId: actorProfileId,
            occurredAt,
            idempotencyKey: parsedInput.idempotencyKey,
            number: allocated.number,
          },
          transaction,
        );
        return {
          result: {
            paymentId: posted.payment.id,
            number: posted.payment.number,
            keptPaise: posted.payment.amountKeptPaise,
            balancePaise: posted.balanceAfterPaise,
          },
          outcome: {
            kind: "payment_added",
            customerId: parsedInput.customerId,
            reason: parsedInput.reason,
            balanceAfterPaise: posted.balanceAfterPaise,
            paymentId: posted.payment.id,
            postedEventId: posted.postedEventId,
            paymentNumber: posted.payment.number,
            mode: posted.payment.mode,
            keptPaise: posted.payment.amountKeptPaise,
            returnedPaise: 0,
          },
        };
      });
    } catch (addError) {
      // A concurrent attempt with the same key won; this one rolled back whole, MP number included.
      if (
        addError instanceof SameKeyAlreadyPosted ||
        violatedUniqueConstraint(addError) === paymentIdempotencyConstraint
      ) {
        const winner = await getPaymentByIdempotencyKey(parsedInput.idempotencyKey);
        if (winner) return this.replayAddPayment(winner, parsedInput);
      }
      throw addError;
    }
    await notifyAdminPaymentOutcome(this.adminAfterCommit, run.outcome);
    return run.result;
  }

  // The Payment paper: current state, who recorded it and from where, and every history event.
  // Also for a deactivated Customer (Correct is then off).
  public async getPaymentPaper(paymentId: string): Promise<PaymentPaper> {
    const row = await getPaymentPaperRow(paymentId);
    if (!row) throw notFound(`Payment ${paymentId} not found`);
    const events = await listPaymentEventsWithActor(paymentId);
    const posted = events.find(({ event }) => event.kind === "posted");
    const latest = events.at(-1);
    if (!posted || !latest) throw internalError(`Payment ${row.payment.number} has no history`);
    const { payment, customer } = row;
    return {
      payment: {
        id: payment.id,
        number: payment.number,
        postedAt: payment.occurredAt,
        mode: payment.mode,
        receivedPaise: payment.amountReceivedPaise,
        keptPaise: payment.amountKeptPaise,
        returnedPaise: payment.amountReturnedPaise,
        reference: payment.reference,
        reason: posted.event.reason,
        actorName: row.actorName,
        source: payment.gatepassId ? "gatepass" : "office",
        gatepass:
          payment.gatepassId && row.gatepassBusinessDate
            ? { id: payment.gatepassId, businessDate: row.gatepassBusinessDate }
            : null,
      },
      customer: {
        id: customer.id,
        shopName: customer.shopName,
        status: customer.status,
        routeName: row.routeName,
        routeCode: row.routeCode,
      },
      events: events.map(({ event, actorName }) => ({
        id: event.id,
        kind: event.kind,
        occurredAt: event.occurredAt,
        keptPaise: event.amountKeptPaise,
        previousKeptPaise: event.previousKeptPaise,
        differencePaise: event.differencePaise,
        mode: event.mode,
        reference: event.reference,
        reason: event.reason,
        correctionDate: event.correctionDate,
        actorName,
        ledgerEntryId: event.ledgerEntryId,
      })),
      latestEventId: latest.event.id,
      balance: await this.ledgerService.getBalance(customer.id),
      actions: { canCorrect: customer.status === "active" && !customer.deletedAt },
    };
  }

  // Fixes a wrongly recorded Payment (office, checkout or field alike). A kept change posts a
  // Payment adjusted Ledger row on the correction date (Credit if kept went up, Debit if down) with
  // the same MP; a mode / reference-only Correct writes the event and no Ledger row. Returned
  // change stays as recorded and received becomes kept + returned. Never touches a Bill.
  public async correctPayment(
    actorProfileId: string,
    input: CorrectPaymentInput,
  ): Promise<CorrectPaymentResult> {
    const parsedInput = correctPaymentInputSchema.parse(input);
    const run = await runInTransaction(
      async (transaction): Promise<Run<CorrectPaymentResult, PaymentCorrectedOutcome>> => {
        const payment = await lockPaymentRow(parsedInput.paymentId, transaction);
        if (!payment) throw notFound(`Payment ${parsedInput.paymentId} not found`);
        const latest = await getLatestPaymentEvent(payment.id, transaction);
        if (latest?.id !== parsedInput.expectedLatestEventId) {
          throw staleCorrectRefusal();
        }
        const differencePaise = parsedInput.keptPaise - payment.amountKeptPaise;
        if (
          differencePaise === 0 &&
          parsedInput.mode === payment.mode &&
          parsedInput.reference === payment.reference
        ) {
          throw nothingChangedRefusal();
        }

        const now = new Date();
        // Spec B reads the Payment row already updated.
        const updated = await updatePayment(
          payment.id,
          {
            amountKeptPaise: parsedInput.keptPaise,
            amountReceivedPaise: parsedInput.keptPaise + payment.amountReturnedPaise,
            mode: parsedInput.mode,
            reference: parsedInput.reference,
          },
          transaction,
        );
        const { ledgerEntryId, balanceAfterPaise } = await this.postAdjustment(
          { payment, differencePaise, reason: parsedInput.reason, actorProfileId, now },
          transaction,
        );
        const event = await insertPaymentEvent(
          {
            paymentId: payment.id,
            kind: "adjusted",
            amountKeptPaise: parsedInput.keptPaise,
            previousKeptPaise: payment.amountKeptPaise,
            differencePaise,
            reason: parsedInput.reason,
            mode: parsedInput.mode,
            reference: parsedInput.reference,
            correctionDate: businessDateOf(now),
            actorId: actorProfileId,
            ledgerEntryId,
            occurredAt: now,
          },
          transaction,
        );
        return {
          result: {
            paymentId: updated.id,
            number: updated.number,
            eventId: event.id,
            ledgerEntryId,
            keptPaise: updated.amountKeptPaise,
            differencePaise,
            mode: updated.mode,
            reference: updated.reference,
            balancePaise: balanceAfterPaise,
          },
          outcome: {
            kind: "payment_corrected",
            customerId: payment.customerId,
            reason: parsedInput.reason,
            balanceAfterPaise,
            paymentId: updated.id,
            adjustedEventId: event.id,
            paymentNumber: updated.number,
            keptBeforePaise: payment.amountKeptPaise,
            keptAfterPaise: updated.amountKeptPaise,
            differencePaise,
            keptChanged: differencePaise !== 0,
            mode: updated.mode,
            reference: updated.reference,
          },
        };
      },
    );
    await notifyAdminPaymentOutcome(this.adminAfterCommit, run.outcome);
    return run.result;
  }

  // A kept change posts through Spec B (which locks the Customer and refuses a deactivated one).
  // A mode / reference-only Correct posts nothing, so it holds the Customer row itself and
  // re-checks it is active, last in the lock order.
  private async postAdjustment(
    input: {
      payment: SelectPayment;
      differencePaise: number;
      reason: string;
      actorProfileId: string;
      now: Date;
    },
    transaction: DbExecutor,
  ): Promise<{ ledgerEntryId: string | null; balanceAfterPaise: number }> {
    const { payment } = input;
    if (input.differencePaise === 0) {
      const customer = await lockCustomerRow(payment.customerId, "share", transaction);
      assertCustomerActive(customer, payment.customerId);
      return { ledgerEntryId: null, balanceAfterPaise: customer.balancePaise };
    }
    const posted = await this.ledgerService.post(
      {
        entryType: "payment_adjusted",
        paymentId: payment.id,
        customerId: payment.customerId,
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

  // The first Add's result for a retried key: its kept amount as posted and the Balance right after
  // its Ledger credit. The same key for another Customer or amount is refused. Nothing is written
  // or sent.
  private async replayAddPayment(
    payment: SelectPayment,
    input: ParsedAddPaymentInput,
  ): Promise<AddPaymentResult> {
    const posted = await getPostedPaymentEvent(payment.id);
    if (!posted?.ledgerEntryId) throw internalError(`Payment ${payment.number} has no Ledger row`);
    if (payment.customerId !== input.customerId || posted.amountKeptPaise !== input.keptPaise) {
      throw keyReusedRefusal();
    }
    const balanceAfterPaise = await getBalanceThroughLedgerEntry(posted.ledgerEntryId);
    if (balanceAfterPaise === undefined) {
      throw internalError(`Payment ${payment.number} has no Ledger row`);
    }
    return {
      paymentId: payment.id,
      number: payment.number,
      keptPaise: posted.amountKeptPaise,
      balancePaise: balanceAfterPaise,
    };
  }

  private async findFieldPaymentResult(
    idempotencyKey: string,
  ): Promise<FieldPaymentResult | undefined> {
    const payment = await getPaymentByIdempotencyKey(idempotencyKey);
    if (!payment) return undefined;
    const balance = await this.ledgerService.getBalance(payment.customerId);
    return {
      paymentId: payment.id,
      number: payment.number,
      keptPaise: payment.amountKeptPaise,
      returnedPaise: payment.amountReturnedPaise,
      balancePaise: balance.balancePaise,
    };
  }
}

export default PaymentService;
export { splitPayment } from "./overpay";
export type { OverpayChoice, PaymentMode, PaymentSplit } from "./overpay";
export type {
  AddPaymentInput,
  AddPaymentResult,
  CheckoutPaymentInput,
  CorrectPaymentInput,
  CorrectPaymentResult,
  PaymentPaper,
  PaymentPaperEvent,
  FieldPaymentResult,
  PostedPayment,
  PostPaymentInput,
  RecordFieldPaymentInput,
} from "./model";
