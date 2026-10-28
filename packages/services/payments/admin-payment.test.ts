import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import {
  billsTable,
  documentNumberSeriesTable,
  paymentEventsTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import LedgerService from "../ledger";
import OrderService from "../orders";
import type { AdminPaymentOutcome } from "../shared/payment-events";
import {
  BOOK_NOW_TOTAL_PAISE,
  expectBalanceMatchesLedger,
  ledgerRowsOf,
  placeBookNowBill,
  refusalOf,
} from "../test/admin-bill-world";
import { buildCheckoutWorld, buildCustomer, type CheckoutWorld } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import PaymentService, { type AddPaymentInput } from "./index";

const ledger = new LedgerService();
const today = "2026-10-25";

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// A service whose Spec J listener records every outcome.
function recordingService() {
  const outcomes: AdminPaymentOutcome[] = [];
  const service = new PaymentService(undefined, (outcome) => {
    outcomes.push(outcome);
  });
  return { service, outcomes };
}

function addInput(world: CheckoutWorld, overrides: Partial<AddPaymentInput> = {}): AddPaymentInput {
  return {
    customerId: world.customer.id,
    mode: "bank",
    keptPaise: 4_000,
    reference: "NEFT-77",
    reason: "Paid at the office",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
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

describe("PaymentService.addPayment", () => {
  it("numbers MP in order, credits the Ledger with the reason and writes the posted event", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    const { service, outcomes } = recordingService();

    const first = await service.addPayment(world.admin.id, addInput(world));
    const second = await service.addPayment(
      world.admin.id,
      addInput(world, { mode: "cash", keptPaise: 1_000, reference: "" }),
    );

    expect(first).toEqual({
      paymentId: expect.any(String),
      number: "MP/26-27/000001",
      keptPaise: 4_000,
      balancePaise: 6_000,
    });
    expect(second).toMatchObject({ number: "MP/26-27/000002", balancePaise: 5_000 });
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, first.paymentId));
    expect(payment).toMatchObject({
      mode: "bank",
      amountReceivedPaise: 4_000,
      amountKeptPaise: 4_000,
      amountReturnedPaise: 0,
      reference: "NEFT-77",
      gatepassId: null,
      actorId: world.admin.id,
    });
    const rows = await ledgerRowsOf(world.customer.id);
    expect(rows.slice(1)).toEqual([
      expect.objectContaining({
        entryType: "payment",
        side: "credit",
        amountPaise: 4_000,
        paymentId: first.paymentId,
        reason: "Paid at the office",
        gatepassId: null,
      }),
      expect.objectContaining({ entryType: "payment", amountPaise: 1_000 }),
    ]);
    const [event] = await db
      .select()
      .from(paymentEventsTable)
      .where(eq(paymentEventsTable.paymentId, first.paymentId));
    expect(event).toMatchObject({
      kind: "posted",
      amountKeptPaise: 4_000,
      previousKeptPaise: 0,
      differencePaise: 4_000,
      reason: "Paid at the office",
      ledgerEntryId: rows[1]!.id,
    });
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(5_000);

    expect(outcomes).toEqual([
      {
        kind: "payment_added",
        customerId: world.customer.id,
        reason: "Paid at the office",
        balanceAfterPaise: 6_000,
        paymentId: first.paymentId,
        postedEventId: event!.id,
        paymentNumber: "MP/26-27/000001",
        mode: "bank",
        keptPaise: 4_000,
        returnedPaise: 0,
      },
      expect.objectContaining({ kind: "payment_added", paymentNumber: "MP/26-27/000002" }),
    ]);
  });

  it("shares the MP series with salesman Payments", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    const service = new PaymentService();
    await service.recordFieldPayment(world.salesman.id, {
      customerId: world.customer.id,
      mode: "cash",
      receivedPaise: 1_000,
      idempotencyKey: randomUUID(),
    });

    const result = await service.addPayment(world.admin.id, addInput(world));

    expect(result.number).toBe("MP/26-27/000002");
  });

  it("anything beyond Pending becomes Advance", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 3_000);

    const result = await new PaymentService().addPayment(
      world.admin.id,
      addInput(world, { keptPaise: 5_000 }),
    );

    expect(result.balancePaise).toBe(-2_000);
    expect(await ledger.getBalance(world.customer.id)).toEqual({
      balancePaise: -2_000,
      state: "advance",
      amountPaise: 2_000,
    });
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("a retry with the same key returns the first Payment: one number, Ledger row and outcome", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    const { service, outcomes } = recordingService();
    const input = addInput(world);

    const first = await service.addPayment(world.admin.id, input);
    // Another posting after the first does not change what the retry shows.
    vi.setSystemTime(new Date("2026-10-25T06:05:00Z"));
    await service.addPayment(world.admin.id, addInput(world, { keptPaise: 500 }));
    const retry = await service.addPayment(world.admin.id, input);
    const concurrent = await Promise.all([
      service.addPayment(world.admin.id, { ...input, idempotencyKey: "same-key" }),
      service.addPayment(world.admin.id, { ...input, idempotencyKey: "same-key" }),
    ]);

    expect(retry).toEqual(first);
    expect(concurrent[0]).toEqual(concurrent[1]);
    const payments = await db.select().from(paymentsTable);
    expect(payments).toHaveLength(3);
    expect(outcomes).toHaveLength(3);
    expect((await ledgerRowsOf(world.customer.id)).filter((row) => row.paymentId)).toHaveLength(3);
    const [series] = await db
      .select()
      .from(documentNumberSeriesTable)
      .where(eq(documentNumberSeriesTable.kind, "payment"));
    expect(series!.nextSeq).toBe(4);
  });

  it("the same key for another amount or Customer is refused", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new PaymentService();
    const input = addInput(world);
    await service.addPayment(world.admin.id, input);

    const otherCustomer = await buildCustomer(world.admin.id, { routeId: world.route.id });

    expect(
      await refusalOf(service.addPayment(world.admin.id, { ...input, keptPaise: 4_001 })),
    ).toMatchObject({ reason: "idempotency_key_reused" });
    expect(
      await refusalOf(
        service.addPayment(world.admin.id, { ...input, customerId: otherCustomer.id }),
      ),
    ).toMatchObject({ reason: "idempotency_key_reused" });
    expect(await db.select().from(paymentsTable)).toHaveLength(1);
  });

  describe("refuses, writing nothing", () => {
    it("₹0, a negative or fractional amount, and a blank reason", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new PaymentService();

      for (const overrides of [
        { keptPaise: 0 },
        { keptPaise: -100 },
        { keptPaise: 10.5 },
        { reason: "   " },
      ]) {
        await expect(
          service.addPayment(world.admin.id, addInput(world, overrides)),
        ).rejects.toMatchObject({ name: "ZodError" });
      }
      expect(await db.select().from(paymentsTable)).toEqual([]);
      expect(await ledgerRowsOf(world.customer.id)).toEqual([]);
    });

    it("a deactivated Customer (reads only), before an MP number is taken", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
      const { service, outcomes } = recordingService();

      expect(await refusalOf(service.addPayment(world.admin.id, addInput(world)))).toMatchObject({
        reason: "customer_inactive",
      });
      expect(await db.select().from(paymentsTable)).toEqual([]);
      expect(
        await db
          .select()
          .from(documentNumberSeriesTable)
          .where(eq(documentNumberSeriesTable.kind, "payment")),
      ).toEqual([]);
      expect(outcomes).toEqual([]);
    });
  });

  it("a Payment in a new financial year starts that year's series", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new PaymentService();
    // 31 March 2027, 23:30 in Asia/Kolkata.
    vi.setSystemTime(new Date("2027-03-31T18:00:00Z"));
    const march = await service.addPayment(world.admin.id, addInput(world));
    // 1 April 2027, 00:00 in Asia/Kolkata.
    vi.setSystemTime(new Date("2027-03-31T18:30:00Z"));
    const april = await service.addPayment(world.admin.id, addInput(world));

    expect(march.number).toBe("MP/26-27/000001");
    expect(april.number).toBe("MP/27-28/000001");
    const series = await db.select().from(documentNumberSeriesTable);
    expect(series.filter((row) => row.kind === "payment")).toHaveLength(2);
  });

  it("a throwing listener does not roll the Payment back", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new PaymentService(undefined, () => {
      throw new Error("WhatsApp is down");
    });

    const result = await service.addPayment(world.admin.id, addInput(world));

    expect(result.number).toBe("MP/26-27/000001");
    expect(await db.select().from(paymentsTable)).toHaveLength(1);
  });
});

describe("PaymentService.getPaymentPaper", () => {
  it("shows the office Payment's header, current Route and posted history", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new PaymentService();
    const added = await service.addPayment(world.admin.id, addInput(world));

    const paper = await service.getPaymentPaper(added.paymentId);

    expect(paper).toEqual({
      payment: {
        id: added.paymentId,
        number: "MP/26-27/000001",
        postedAt: new Date("2026-10-25T06:00:00Z"),
        mode: "bank",
        receivedPaise: 4_000,
        keptPaise: 4_000,
        returnedPaise: 0,
        reference: "NEFT-77",
        reason: "Paid at the office",
        actorName: world.admin.name,
        source: "office",
        gatepass: null,
      },
      customer: {
        id: world.customer.id,
        shopName: world.customer.shopName,
        status: "active",
        routeName: world.route.name,
        routeCode: world.route.code,
      },
      events: [
        expect.objectContaining({
          kind: "posted",
          keptPaise: 4_000,
          previousKeptPaise: 0,
          differencePaise: 4_000,
          reason: "Paid at the office",
          correctionDate: null,
          actorName: world.admin.name,
          ledgerEntryId: expect.any(String),
        }),
      ],
      latestEventId: paper.events[0]!.id,
      balance: { balancePaise: -4_000, state: "advance", amountPaise: 4_000 },
      actions: { canCorrect: true },
    });
  });

  it("shows a salesman's field Payment with its GatePass and no reason", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await owe(world, 10_000);
    const service = new PaymentService();
    const field = await service.recordFieldPayment(world.salesman.id, {
      customerId: world.customer.id,
      mode: "cash",
      receivedPaise: 2_000,
      idempotencyKey: randomUUID(),
    });

    const paper = await service.getPaymentPaper(field.paymentId);

    expect(paper.payment).toMatchObject({
      source: "gatepass",
      gatepass: { id: world.gatepass.id, businessDate: today },
      reason: null,
      actorName: world.salesman.name,
    });
  });

  it("refuses an unknown Payment", async () => {
    await expect(new PaymentService().getPaymentPaper(randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("PaymentService.correctPayment", () => {
  async function addedPayment(world: CheckoutWorld, service: PaymentService) {
    await owe(world, 10_000);
    const added = await service.addPayment(world.admin.id, addInput(world));
    const paper = await service.getPaymentPaper(added.paymentId);
    vi.setSystemTime(new Date("2026-10-27T06:00:00Z"));
    return { added, latestEventId: paper.latestEventId };
  }

  it("kept down posts a Debit Payment adjusted row on the correction date, same MP", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { service, outcomes } = recordingService();
    const { added, latestEventId } = await addedPayment(world, service);

    const result = await service.correctPayment(world.admin.id, {
      paymentId: added.paymentId,
      expectedLatestEventId: latestEventId,
      keptPaise: 3_500,
      mode: "bank",
      reference: "NEFT-77",
      reason: "Counted ₹5 short",
    });

    expect(result).toEqual({
      paymentId: added.paymentId,
      number: "MP/26-27/000001",
      eventId: expect.any(String),
      ledgerEntryId: expect.any(String),
      keptPaise: 3_500,
      receivedPaise: 3_500,
      returnedPaise: 0,
      differencePaise: -500,
      mode: "bank",
      reference: "NEFT-77",
      balancePaise: 6_500,
    });
    const rows = await ledgerRowsOf(world.customer.id);
    expect(rows.at(-1)).toMatchObject({
      id: result.ledgerEntryId,
      entryType: "payment_adjusted",
      side: "debit",
      amountPaise: 500,
      paymentId: added.paymentId,
      reason: "Counted ₹5 short",
      occurredAt: new Date("2026-10-27T06:00:00Z"),
      gatepassId: null,
    });
    const paper = await service.getPaymentPaper(added.paymentId);
    expect(paper.payment).toMatchObject({ keptPaise: 3_500, receivedPaise: 3_500 });
    // The header reason stays the Add reason.
    expect(paper.payment.reason).toBe("Paid at the office");
    expect(paper.events.map((event) => event.kind)).toEqual(["posted", "adjusted"]);
    expect(paper.events[1]).toMatchObject({
      id: result.eventId,
      keptPaise: 3_500,
      previousKeptPaise: 4_000,
      differencePaise: -500,
      reason: "Counted ₹5 short",
      correctionDate: "2026-10-27",
      ledgerEntryId: result.ledgerEntryId,
    });
    expect(paper.latestEventId).toBe(result.eventId);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(6_500);
    expect(outcomes.at(-1)).toEqual({
      kind: "payment_corrected",
      customerId: world.customer.id,
      reason: "Counted ₹5 short",
      balanceAfterPaise: 6_500,
      paymentId: added.paymentId,
      adjustedEventId: result.eventId,
      paymentNumber: "MP/26-27/000001",
      keptBeforePaise: 4_000,
      keptAfterPaise: 3_500,
      differencePaise: -500,
      keptChanged: true,
      mode: "bank",
      reference: "NEFT-77",
    });
  });

  it("kept up posts a Credit", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new PaymentService();
    const { added, latestEventId } = await addedPayment(world, service);

    const result = await service.correctPayment(world.admin.id, {
      paymentId: added.paymentId,
      expectedLatestEventId: latestEventId,
      keptPaise: 4_200,
      mode: "bank",
      reference: "NEFT-77",
      reason: "Typed ₹2 short",
    });

    expect(result.balancePaise).toBe(5_800);
    expect((await ledgerRowsOf(world.customer.id)).at(-1)).toMatchObject({
      entryType: "payment_adjusted",
      side: "credit",
      amountPaise: 200,
    });
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("to ₹0 keeps the Payment, its number and the original row; the Ledger nets to 0", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new PaymentService();
    const { added, latestEventId } = await addedPayment(world, service);

    const result = await service.correctPayment(world.admin.id, {
      paymentId: added.paymentId,
      expectedLatestEventId: latestEventId,
      keptPaise: 0,
      mode: "bank",
      reference: "NEFT-77",
      reason: "Cheque bounced",
    });

    expect(result.balancePaise).toBe(10_000);
    const paymentRows = (await ledgerRowsOf(world.customer.id)).filter(
      (row) => row.paymentId === added.paymentId,
    );
    expect(paymentRows.map((row) => [row.entryType, row.side, row.amountPaise])).toEqual([
      ["payment", "credit", 4_000],
      ["payment_adjusted", "debit", 4_000],
    ]);
    const paper = await service.getPaymentPaper(added.paymentId);
    expect(paper.payment).toMatchObject({ number: "MP/26-27/000001", keptPaise: 0 });
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("mode or reference only adds an event with no Ledger row", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { service, outcomes } = recordingService();
    const { added, latestEventId } = await addedPayment(world, service);
    const rowsBefore = await ledgerRowsOf(world.customer.id);

    const result = await service.correctPayment(world.admin.id, {
      paymentId: added.paymentId,
      expectedLatestEventId: latestEventId,
      keptPaise: 4_000,
      mode: "upi",
      reference: "",
      reason: "It came by UPI",
    });

    expect(result).toMatchObject({
      ledgerEntryId: null,
      differencePaise: 0,
      mode: "upi",
      reference: null,
      balancePaise: 6_000,
    });
    expect(await ledgerRowsOf(world.customer.id)).toEqual(rowsBefore);
    const paper = await service.getPaymentPaper(added.paymentId);
    expect(paper.payment).toMatchObject({ mode: "upi", reference: null });
    expect(paper.events[1]).toMatchObject({
      kind: "adjusted",
      keptPaise: 4_000,
      previousKeptPaise: 4_000,
      differencePaise: 0,
      ledgerEntryId: null,
    });
    expect(outcomes.at(-1)).toMatchObject({ kind: "payment_corrected", keptChanged: false });
  });

  it("a cash checkout Payment keeps the change returned and recomputes received", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await new OrderService().placeBookNow(world.salesman.id, {
      customerId: world.customer.id,
      idempotencyKey: randomUUID(),
      lines: [
        { sku: world.milk.sku, qty: 3 },
        { sku: world.curd.sku, qty: 1 },
      ],
      payment: { mode: "cash", receivedPaise: 20_000, overpay: "return_change" },
    });
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.number, placed.payment!.number));
    expect(payment).toMatchObject({
      amountReceivedPaise: 20_000,
      amountKeptPaise: BOOK_NOW_TOTAL_PAISE,
      amountReturnedPaise: 20_000 - BOOK_NOW_TOTAL_PAISE,
    });
    const service = new PaymentService();
    const paper = await service.getPaymentPaper(payment!.id);

    const result = await service.correctPayment(world.admin.id, {
      paymentId: payment!.id,
      expectedLatestEventId: paper.latestEventId,
      keptPaise: 11_000,
      mode: "cash",
      reference: null,
      reason: "Salesman kept ₹9 less",
    });

    const [corrected] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, payment!.id));
    expect(corrected).toMatchObject({
      amountKeptPaise: 11_000,
      amountReturnedPaise: 20_000 - BOOK_NOW_TOTAL_PAISE,
      amountReceivedPaise: 11_000 + 20_000 - BOOK_NOW_TOTAL_PAISE,
    });
    expect(result).toMatchObject({
      keptPaise: 11_000,
      returnedPaise: 20_000 - BOOK_NOW_TOTAL_PAISE,
      receivedPaise: 11_000 + 20_000 - BOOK_NOW_TOTAL_PAISE,
    });
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("never touches a Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world, { receivedPaise: 5_000 });
    const billsBefore = await db.select().from(billsTable);
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.number, placed.payment!.number));
    const service = new PaymentService();
    const paper = await service.getPaymentPaper(payment!.id);

    await service.correctPayment(world.admin.id, {
      paymentId: payment!.id,
      expectedLatestEventId: paper.latestEventId,
      keptPaise: 4_000,
      mode: "cash",
      reference: null,
      reason: "Counted short",
    });

    expect(await db.select().from(billsTable)).toEqual(billsBefore);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(BOOK_NOW_TOTAL_PAISE - 4_000);
  });

  describe("refuses, writing nothing", () => {
    it("a Correct that changes nothing", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { service, outcomes } = recordingService();
      const { added, latestEventId } = await addedPayment(world, service);

      expect(
        await refusalOf(
          service.correctPayment(world.admin.id, {
            paymentId: added.paymentId,
            expectedLatestEventId: latestEventId,
            keptPaise: 4_000,
            mode: "bank",
            reference: " NEFT-77 ",
            reason: "No change",
          }),
        ),
      ).toMatchObject({ reason: "nothing_changed" });
      expect(await db.select().from(paymentEventsTable)).toHaveLength(1);
      expect(outcomes).toHaveLength(1);
    });

    it("a stale view: someone else corrected first", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new PaymentService();
      const { added, latestEventId } = await addedPayment(world, service);
      const correct = (keptPaise: number) =>
        service.correctPayment(world.admin.id, {
          paymentId: added.paymentId,
          expectedLatestEventId: latestEventId,
          keptPaise,
          mode: "bank",
          reference: "NEFT-77",
          reason: "Fix",
        });
      await correct(3_000);

      expect(await refusalOf(correct(2_000))).toMatchObject({ reason: "stale_version" });
      expect(await ledgerRowsOf(world.customer.id)).toHaveLength(3);
      expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(7_000);
    });

    it("two Corrects at once from the same view: exactly one lands", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new PaymentService();
      const { added, latestEventId } = await addedPayment(world, service);
      const correct = (keptPaise: number) =>
        service.correctPayment(world.admin.id, {
          paymentId: added.paymentId,
          expectedLatestEventId: latestEventId,
          keptPaise,
          mode: "bank",
          reference: "NEFT-77",
          reason: "Fix",
        });

      const settled = await Promise.allSettled([correct(3_000), correct(2_000)]);

      expect(settled.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejected = settled.find((outcome) => outcome.status === "rejected");
      expect(
        await refusalOf(Promise.reject((rejected as PromiseRejectedResult).reason)),
      ).toMatchObject({ reason: "stale_version" });
      expect(await db.select().from(paymentEventsTable)).toHaveLength(2);
      await expectBalanceMatchesLedger(world.customer.id);
    });

    it("a deactivated Customer, also for a mode-only Correct", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new PaymentService();
      const { added, latestEventId } = await addedPayment(world, service);
      await service.addPayment(world.admin.id, addInput(world, { keptPaise: 6_000 }));
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);

      for (const keptPaise of [3_000, 4_000]) {
        expect(
          await refusalOf(
            service.correctPayment(world.admin.id, {
              paymentId: added.paymentId,
              expectedLatestEventId: latestEventId,
              keptPaise,
              mode: "upi",
              reference: "NEFT-77",
              reason: "Fix",
            }),
          ),
        ).toMatchObject({ reason: "customer_inactive" });
      }
      expect(await db.select().from(paymentEventsTable)).toHaveLength(2);
      const paper = await service.getPaymentPaper(added.paymentId);
      expect(paper.actions.canCorrect).toBe(false);
      expect(paper.payment.mode).toBe("bank");
    });

    it("an unknown Payment and a blank reason", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new PaymentService();
      const { added, latestEventId } = await addedPayment(world, service);

      await expect(
        service.correctPayment(world.admin.id, {
          paymentId: randomUUID(),
          expectedLatestEventId: latestEventId,
          keptPaise: 1,
          mode: "bank",
          reference: null,
          reason: "Fix",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        service.correctPayment(world.admin.id, {
          paymentId: added.paymentId,
          expectedLatestEventId: latestEventId,
          keptPaise: 1,
          mode: "bank",
          reference: null,
          reason: " ",
        }),
      ).rejects.toMatchObject({ name: "ZodError" });
      expect(await db.select().from(paymentEventsTable)).toHaveLength(1);
    });
  });
});
