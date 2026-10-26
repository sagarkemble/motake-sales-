import { lockCustomerRow, getCustomerById } from "@repo/database/queries/customers";
import {
  getPaymentByIdempotencyKey,
  insertPayment,
  insertPaymentEvent,
} from "@repo/database/queries/payments";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";

import DocumentNumberService from "../document-numbers";
import { checkoutRefusal } from "../errors";
import GatepassService from "../gatepass";
import LedgerService from "../ledger";
import { assertCustomerOnRoute, noActiveGatepassRefusal } from "../shared/checkout";
import {
  noCheckoutListener,
  notifyAfterCommit,
  type CheckoutListener,
} from "../shared/checkout-events";
import { financialYearOfInstant } from "../shared/financial-year";
import {
  postPaymentInputSchema,
  recordFieldPaymentInputSchema,
  type FieldPaymentResult,
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

// Rolls back a field Payment whose key another call already posted.
class SameKeyAlreadyPosted extends Error {}

// Payments: the only writer of `payments` rows and their `posted` event. Checkout (Book Now,
// fulfil) and field Payment post here; Spec H's Admin Add Payment uses the same posting step.
class PaymentService {
  private readonly documentNumbers = new DocumentNumberService();
  private readonly gatepassService = new GatepassService();
  private readonly ledgerService = new LedgerService();

  // Spec J's listener, called once after a field Payment commits.
  public constructor(private readonly afterCommit: CheckoutListener = noCheckoutListener) {}

  // Runs in the caller's transaction, after the caller allocated the MP number (FY of
  // `occurredAt`) and locked the Customer. Inserts the Payment, credits the Ledger with the kept
  // amount and records the `posted` event linked to that credit.
  public async post(input: PostPaymentInput, executor: DbExecutor): Promise<PostedPayment> {
    const parsedInput = postPaymentInputSchema.parse(input);
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
  CheckoutPaymentInput,
  FieldPaymentResult,
  PostedPayment,
  PostPaymentInput,
  RecordFieldPaymentInput,
} from "./model";
