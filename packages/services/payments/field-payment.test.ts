import { randomUUID } from "node:crypto";

import { db, eq, sql } from "@repo/database";
import {
  customersTable,
  documentNumberSeriesTable,
  gatepassesTable,
  ledgerEntriesTable,
  paymentEventsTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runInTransaction } from "@repo/database/queries/shared/executor";

import { checkoutRefusalOf } from "../errors";
import LedgerService from "../ledger";
import type { CheckoutOutcome } from "../shared/checkout-events";
import OrderService from "../orders";
import { buildCheckoutWorld, buildPayment, buildRoute, type CheckoutWorld } from "../test/builders";
import { waitForLockWaiter, wipeApplicationTables } from "../test/database";
import PaymentService, { type RecordFieldPaymentInput } from "./index";

const paymentService = new PaymentService();
const ledger = new LedgerService();
const today = "2026-10-25";

// Every test counts rows and numbers from an empty database.
beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function fieldInput(
  world: CheckoutWorld,
  overrides: Partial<RecordFieldPaymentInput> = {},
): RecordFieldPaymentInput {
  return {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    mode: "cash",
    receivedPaise: 5_000,
    ...overrides,
  };
}

async function refusalOf(call: Promise<unknown>) {
  const error = await call.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!error) throw new Error("Expected the call to be refused");
  const refusal = checkoutRefusalOf(error);
  if (!refusal) throw error;
  return refusal;
}

async function paymentSeriesNextSeq(financialYear = "26-27") {
  const [row] = await db
    .select({ nextSeq: documentNumberSeriesTable.nextSeq })
    .from(documentNumberSeriesTable)
    .where(
      sql`${documentNumberSeriesTable.kind} = 'payment' AND ${documentNumberSeriesTable.financialYear} = ${financialYear}`,
    );
  return row?.nextSeq ?? 1;
}

async function owe(world: CheckoutWorld, amountPaise: number) {
  await ledger.setOpeningBalance({
    customerId: world.customer.id,
    direction: "pending",
    amountPaise,
    reason: "Carried over",
    actorId: world.admin.id,
  });
}

describe("PaymentService.recordFieldPayment", () => {
  it("posts the Payment, its Ledger credit and posted event against the Active GatePass", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);

    const result = await paymentService.recordFieldPayment(
      world.salesman.id,
      fieldInput(world, { mode: "upi", reference: "UPI-9" }),
    );

    expect(result).toEqual({
      paymentId: expect.any(String),
      number: "MP/26-27/000001",
      keptPaise: 5_000,
      returnedPaise: 0,
      balancePaise: 5_000,
    });
    const [payment] = await db.select().from(paymentsTable);
    expect(payment).toMatchObject({
      id: result.paymentId,
      mode: "upi",
      reference: "UPI-9",
      amountReceivedPaise: 5_000,
      amountKeptPaise: 5_000,
      gatepassId: world.gatepass.id,
      actorId: world.salesman.id,
    });
    const [credit] = await db
      .select()
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.paymentId, result.paymentId));
    expect(credit).toMatchObject({
      entryType: "payment",
      side: "credit",
      amountPaise: 5_000,
      gatepassId: world.gatepass.id,
      reason: null,
    });
    const [event] = await db.select().from(paymentEventsTable);
    expect(event).toMatchObject({
      paymentId: result.paymentId,
      kind: "posted",
      amountKeptPaise: 5_000,
      previousKeptPaise: 0,
      differencePaise: 5_000,
      ledgerEntryId: credit!.id,
      reason: null,
    });
    expect((await ledger.getBalance(world.customer.id)).balancePaise).toBe(5_000);
  });

  it("returns cash change over Pending, or keeps it all as Advance", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 3_000);

    const returned = await paymentService.recordFieldPayment(
      world.salesman.id,
      fieldInput(world, { overpay: "return_change" }),
    );
    expect(returned).toMatchObject({ keptPaise: 3_000, returnedPaise: 2_000, balancePaise: 0 });

    const kept = await paymentService.recordFieldPayment(
      world.salesman.id,
      fieldInput(world, { overpay: "keep_advance" }),
    );
    expect(kept).toMatchObject({
      number: "MP/26-27/000002",
      keptPaise: 5_000,
      returnedPaise: 0,
      balancePaise: -5_000,
    });
  });

  it("refuses kept ₹0, cash overpay with no choice, and return change on bank", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    // Settled: all cash would be change.
    expect(
      await refusalOf(
        paymentService.recordFieldPayment(
          world.salesman.id,
          fieldInput(world, { overpay: "return_change" }),
        ),
      ),
    ).toMatchObject({ reason: "field_payment_kept_zero" });
    expect(
      await refusalOf(
        paymentService.recordFieldPayment(world.salesman.id, fieldInput(world, { receivedPaise: 0 })),
      ),
    ).toMatchObject({ reason: "field_payment_kept_zero" });
    expect(
      await refusalOf(paymentService.recordFieldPayment(world.salesman.id, fieldInput(world))),
    ).toEqual({
      reason: "overpay_choice_required",
      details: { requiredPaise: 0, receivedPaise: 5_000 },
    });
    expect(
      await refusalOf(
        paymentService.recordFieldPayment(
          world.salesman.id,
          fieldInput(world, { mode: "bank", overpay: "return_change" }),
        ),
      ),
    ).toMatchObject({ reason: "return_change_cash_only" });
    expect(await db.select().from(paymentsTable)).toHaveLength(0);
    expect(await paymentSeriesNextSeq()).toBe(1);
  });

  it("refuses with no Active GatePass, or for a Customer off its Route or inactive", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    await db
      .update(customersTable)
      .set({ routeId: (await buildRoute()).id })
      .where(eq(customersTable.id, world.customer.id));
    expect(
      await refusalOf(paymentService.recordFieldPayment(world.salesman.id, fieldInput(world))),
    ).toMatchObject({ reason: "customer_not_on_route" });

    await db
      .update(customersTable)
      .set({ routeId: world.route.id, status: "inactive" })
      .where(eq(customersTable.id, world.customer.id));
    expect(
      await refusalOf(paymentService.recordFieldPayment(world.salesman.id, fieldInput(world))),
    ).toMatchObject({ reason: "customer_inactive" });

    await db
      .update(gatepassesTable)
      .set({ status: "pending_verification" })
      .where(eq(gatepassesTable.id, world.gatepass.id));
    expect(
      await refusalOf(paymentService.recordFieldPayment(world.salesman.id, fieldInput(world))),
    ).toMatchObject({ reason: "no_active_gatepass" });
    expect(await db.select().from(paymentsTable)).toHaveLength(0);
  });

  it("returns the first Payment for the same key, also when two calls race", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    const input = fieldInput(world);

    const [first, second] = await Promise.all([
      paymentService.recordFieldPayment(world.salesman.id, input),
      paymentService.recordFieldPayment(world.salesman.id, input),
    ]);
    const retry = await paymentService.recordFieldPayment(world.salesman.id, {
      ...input,
      receivedPaise: 9_000,
    });

    expect(second).toEqual(first);
    expect(retry).toEqual(first);
    expect(await db.select().from(paymentsTable)).toHaveLength(1);
    expect((await ledger.getBalance(world.customer.id)).balancePaise).toBe(5_000);
    // The losing call rolled back, so no MP number was burnt.
    expect(await paymentSeriesNextSeq()).toBe(2);
  });

  it("tells the listener once, after commit, and survives a throwing listener", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    const outcomes: CheckoutOutcome[] = [];
    const service = new PaymentService((outcome) => {
      outcomes.push(outcome);
      throw new Error("WhatsApp is down");
    });
    const input = fieldInput(world);

    const result = await service.recordFieldPayment(world.salesman.id, input);
    await service.recordFieldPayment(world.salesman.id, input);

    const [event] = await db.select().from(paymentEventsTable);
    expect(outcomes).toEqual([
      {
        bill: null,
        payment: {
          paymentId: result.paymentId,
          postedEventId: event!.id,
          paymentNumber: "MP/26-27/000001",
          customerId: world.customer.id,
          keptPaise: 5_000,
          returnedPaise: 0,
          balanceAfterPaise: 5_000,
        },
      },
    ]);
  });

  it("numbers the Payment in its financial year", async () => {
    vi.setSystemTime(new Date("2027-04-01T03:00:00Z"));
    const world = await buildCheckoutWorld({ businessDate: "2027-04-01" });
    await owe(world, 10_000);

    const result = await paymentService.recordFieldPayment(world.salesman.id, fieldInput(world));

    expect(result.number).toBe("MP/27-28/000001");
  });

  it("numbers checkout and field Payments from one MP series", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const orderService = new OrderService();

    const bookNow = await orderService.placeBookNow(world.salesman.id, {
      customerId: world.customer.id,
      idempotencyKey: randomUUID(),
      lines: [{ sku: world.milk.sku, qty: 3 }],
      payment: { mode: "cash", receivedPaise: 1_000 },
    });
    const field = await paymentService.recordFieldPayment(world.salesman.id, fieldInput(world));

    expect(bookNow.payment?.number).toBe("MP/26-27/000001");
    expect(field.number).toBe("MP/26-27/000002");
    expect(await paymentSeriesNextSeq()).toBe(3);
  });

  it("refuses kept ₹0 when a concurrent post settles the Customer first, burning no MP", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 5_000);
    const otherPayment = await buildPayment({
      customer: world.customer,
      actorId: world.admin.id,
      keptPaise: 5_000,
    });

    let releaseHolder!: () => void;
    const holderMayCommit = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let holderLocked!: () => void;
    const holderHasLock = new Promise<void>((resolve) => {
      holderLocked = resolve;
    });
    // Holds the Customer while the field Payment reads ₹50 Pending, then clears it.
    const holder = runInTransaction(async (transaction) => {
      await ledger.lockBalance(world.customer.id, transaction);
      holderLocked();
      await holderMayCommit;
      await ledger.post(
        {
          entryType: "payment",
          paymentId: otherPayment.id,
          customerId: world.customer.id,
          actorId: world.admin.id,
        },
        transaction,
      );
    });
    await holderHasLock;

    const field = refusalOf(
      paymentService.recordFieldPayment(
        world.salesman.id,
        fieldInput(world, { overpay: "return_change" }),
      ),
    );
    await waitForLockWaiter();
    releaseHolder();
    await holder;

    expect(await field).toMatchObject({ reason: "field_payment_kept_zero" });
    // Only the holder's own Payment row exists; the MP allocation rolled back.
    expect(await db.select().from(paymentsTable)).toHaveLength(1);
    expect(await paymentSeriesNextSeq()).toBe(1);
    expect((await ledger.getBalance(world.customer.id)).balancePaise).toBe(0);
  });
});

