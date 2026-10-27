import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { documentNumberSeriesTable, refundEventsTable, refundsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import LedgerService from "../ledger";
import PaymentService from "../payments";
import type { AdminPaymentOutcome } from "../shared/payment-events";
import {
  BOOK_NOW_TOTAL_PAISE,
  expectBalanceMatchesLedger,
  ledgerRowsOf,
  placeBookNowBill,
  refusalOf,
} from "../test/admin-bill-world";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import RefundService, { type AddRefundInput, type CorrectRefundInput } from "./index";

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

function recordingService() {
  const outcomes: AdminPaymentOutcome[] = [];
  const service = new RefundService((outcome) => {
    outcomes.push(outcome);
  });
  return { service, outcomes };
}

function addInput(world: CheckoutWorld, overrides: Partial<AddRefundInput> = {}): AddRefundInput {
  return {
    customerId: world.customer.id,
    mode: "upi",
    amountPaise: 3_000,
    reference: "UPI-REF-1",
    reason: "Shop closed, Advance paid back",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function openWith(
  world: CheckoutWorld,
  direction: "pending" | "advance",
  amountPaise: number,
) {
  await ledger.setOpeningBalance({
    customerId: world.customer.id,
    direction,
    amountPaise,
    reason: "Carried over",
    actorId: world.admin.id,
  });
}

async function refundSeriesNextSeq() {
  const [row] = await db
    .select({ nextSeq: documentNumberSeriesTable.nextSeq })
    .from(documentNumberSeriesTable)
    .where(eq(documentNumberSeriesTable.kind, "refund"));
  return row?.nextSeq ?? 1;
}

describe("RefundService.addRefund", () => {
  it("numbers MR, debits the Ledger with the reason and writes the posted event", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await openWith(world, "advance", 10_000);
    const { service, outcomes } = recordingService();

    const result = await service.addRefund(world.admin.id, addInput(world));

    expect(result).toEqual({
      refundId: expect.any(String),
      number: "MR/26-27/000001",
      amountPaise: 3_000,
      balancePaise: -7_000,
    });
    const rows = await ledgerRowsOf(world.customer.id);
    expect(rows[1]).toMatchObject({
      entryType: "refund",
      side: "debit",
      amountPaise: 3_000,
      refundId: result.refundId,
      reason: "Shop closed, Advance paid back",
      actorId: world.admin.id,
    });
    const [event] = await db.select().from(refundEventsTable);
    expect(event).toMatchObject({
      refundId: result.refundId,
      kind: "posted",
      amountPaise: 3_000,
      previousAmountPaise: 0,
      differencePaise: 3_000,
      mode: "upi",
      reference: "UPI-REF-1",
      reason: "Shop closed, Advance paid back",
      correctionDate: null,
      ledgerEntryId: rows[1]!.id,
    });
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(-7_000);
    expect(outcomes).toEqual([
      {
        kind: "refund_added",
        customerId: world.customer.id,
        reason: "Shop closed, Advance paid back",
        balanceAfterPaise: -7_000,
        refundId: result.refundId,
        postedEventId: event!.id,
        refundNumber: "MR/26-27/000001",
        mode: "upi",
        amountPaise: 3_000,
      },
    ]);

    const second = await service.addRefund(world.admin.id, addInput(world));
    expect(second.number).toBe("MR/26-27/000002");
  });

  it("the exact Advance is allowed and settles the Balance", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await openWith(world, "advance", 3_000);

    const result = await new RefundService().addRefund(world.admin.id, addInput(world));

    expect(result.balancePaise).toBe(0);
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("an Advance from an office Payment can be refunded", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await new PaymentService().addPayment(world.admin.id, {
      customerId: world.customer.id,
      mode: "cash",
      keptPaise: 5_000,
      reason: "Paid ahead",
      idempotencyKey: randomUUID(),
    });

    const result = await new RefundService().addRefund(world.admin.id, addInput(world));

    expect(result.balancePaise).toBe(-2_000);
  });

  it("a retry with the same key returns the first Refund; another amount is refused", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await openWith(world, "advance", 10_000);
    const { service, outcomes } = recordingService();
    const input = addInput(world);

    const first = await service.addRefund(world.admin.id, input);
    vi.setSystemTime(new Date("2026-10-25T06:05:00Z"));
    await service.addRefund(world.admin.id, addInput(world, { amountPaise: 1_000 }));
    const retry = await service.addRefund(world.admin.id, input);

    expect(retry).toEqual(first);
    expect(await db.select().from(refundsTable)).toHaveLength(2);
    expect(outcomes).toHaveLength(2);
    expect(await refundSeriesNextSeq()).toBe(3);
    expect(
      await refusalOf(service.addRefund(world.admin.id, { ...input, amountPaise: 2_000 })),
    ).toMatchObject({ reason: "idempotency_key_reused" });
  });

  describe("refuses, writing nothing and giving the MR number back", () => {
    it("while Pending, and while Settled", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { service, outcomes } = recordingService();

      expect(await refusalOf(service.addRefund(world.admin.id, addInput(world)))).toEqual({
        reason: "not_in_advance",
        details: { balancePaise: 0 },
      });
      await openWith(world, "pending", 1_000);
      expect(await refusalOf(service.addRefund(world.admin.id, addInput(world)))).toEqual({
        reason: "not_in_advance",
        details: { balancePaise: 1_000 },
      });
      expect(await db.select().from(refundsTable)).toEqual([]);
      expect(await refundSeriesNextSeq()).toBe(1);
      expect(outcomes).toEqual([]);
    });

    it("more than the Advance, showing the Advance", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await openWith(world, "advance", 2_500);

      const refusal = await refusalOf(
        new RefundService().addRefund(world.admin.id, addInput(world)),
      );

      expect(refusal).toEqual({
        reason: "refund_above_advance",
        details: { advancePaise: 2_500 },
      });
      expect(await db.select().from(refundsTable)).toEqual([]);
      expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(-2_500);
    });

    it("₹0 and a blank reason", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await openWith(world, "advance", 10_000);
      const service = new RefundService();

      for (const overrides of [{ amountPaise: 0 }, { reason: "" }]) {
        await expect(
          service.addRefund(world.admin.id, addInput(world, overrides)),
        ).rejects.toThrow();
      }
      expect(await db.select().from(refundsTable)).toEqual([]);
    });

    it("a deactivated Customer", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await openWith(world, "advance", 10_000);
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);

      expect(
        await refusalOf(new RefundService().addRefund(world.admin.id, addInput(world))),
      ).toMatchObject({ reason: "customer_inactive" });
      expect(await db.select().from(refundsTable)).toEqual([]);
    });
  });

  it("two Refunds racing for the same Advance: only one lands", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await openWith(world, "advance", 3_000);
    const service = new RefundService();

    const settled = await Promise.allSettled([
      service.addRefund(world.admin.id, addInput(world)),
      service.addRefund(world.admin.id, addInput(world)),
    ]);

    expect(settled.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((outcome) => outcome.status === "rejected");
    expect(await refusalOf(Promise.reject((rejected as PromiseRejectedResult).reason))).toEqual({
      reason: "not_in_advance",
      details: { balancePaise: 0 },
    });
    expect(await db.select().from(refundsTable)).toHaveLength(1);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
  });
});

describe("RefundService.getRefundPaper", () => {
  it("shows the header, current Route, Advance and posted history", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await openWith(world, "advance", 10_000);
    const service = new RefundService();
    const added = await service.addRefund(world.admin.id, addInput(world));

    const paper = await service.getRefundPaper(added.refundId);

    expect(paper).toEqual({
      refund: {
        id: added.refundId,
        number: "MR/26-27/000001",
        postedAt: new Date("2026-10-25T06:00:00Z"),
        mode: "upi",
        amountPaise: 3_000,
        reference: "UPI-REF-1",
        reason: "Shop closed, Advance paid back",
        actorName: world.admin.name,
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
          amountPaise: 3_000,
          previousAmountPaise: 0,
          differencePaise: 3_000,
          actorName: world.admin.name,
        }),
      ],
      latestEventId: paper.events[0]!.id,
      balance: { balancePaise: -7_000, state: "advance", amountPaise: 7_000 },
      actions: { canCorrect: true },
    });
  });

  it("refuses an unknown Refund", async () => {
    await expect(new RefundService().getRefundPaper(randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("RefundService.correctRefund", () => {
  // ₹30.00 refunded out of ₹100.00 Advance: ₹70.00 Advance left.
  async function addedRefund(world: CheckoutWorld, service: RefundService) {
    await openWith(world, "advance", 10_000);
    const added = await service.addRefund(world.admin.id, addInput(world));
    const paper = await service.getRefundPaper(added.refundId);
    vi.setSystemTime(new Date("2026-10-27T06:00:00Z"));
    const correctInput = (overrides: Partial<CorrectRefundInput>): CorrectRefundInput => ({
      refundId: added.refundId,
      expectedLatestEventId: paper.latestEventId,
      amountPaise: 3_000,
      mode: "upi",
      reference: "UPI-REF-1",
      reason: "Typed wrong",
      ...overrides,
    });
    return { added, correctInput };
  }

  it("up within the Advance posts a Debit Refund adjusted row, same MR", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { service, outcomes } = recordingService();
    const { added, correctInput } = await addedRefund(world, service);

    const result = await service.correctRefund(
      world.admin.id,
      correctInput({ amountPaise: 10_000, reason: "Paid back the whole Advance" }),
    );

    expect(result).toEqual({
      refundId: added.refundId,
      number: "MR/26-27/000001",
      eventId: expect.any(String),
      ledgerEntryId: expect.any(String),
      amountPaise: 10_000,
      differencePaise: 7_000,
      mode: "upi",
      reference: "UPI-REF-1",
      balancePaise: 0,
    });
    expect((await ledgerRowsOf(world.customer.id)).at(-1)).toMatchObject({
      id: result.ledgerEntryId,
      entryType: "refund_adjusted",
      side: "debit",
      amountPaise: 7_000,
      refundId: added.refundId,
      reason: "Paid back the whole Advance",
      occurredAt: new Date("2026-10-27T06:00:00Z"),
    });
    const paper = await service.getRefundPaper(added.refundId);
    expect(paper.refund).toMatchObject({
      amountPaise: 10_000,
      reason: "Shop closed, Advance paid back",
    });
    expect(paper.events[1]).toMatchObject({
      kind: "adjusted",
      amountPaise: 10_000,
      previousAmountPaise: 3_000,
      differencePaise: 7_000,
      correctionDate: "2026-10-27",
      reason: "Paid back the whole Advance",
      ledgerEntryId: result.ledgerEntryId,
    });
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
    expect(outcomes.at(-1)).toEqual({
      kind: "refund_corrected",
      customerId: world.customer.id,
      reason: "Paid back the whole Advance",
      balanceAfterPaise: 0,
      refundId: added.refundId,
      adjustedEventId: result.eventId,
      refundNumber: "MR/26-27/000001",
      amountBeforePaise: 3_000,
      amountAfterPaise: 10_000,
      differencePaise: 7_000,
      amountChanged: true,
      mode: "upi",
      reference: "UPI-REF-1",
    });
  });

  it("up beyond the Advance is refused, showing the Advance", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { service, outcomes } = recordingService();
    const { correctInput } = await addedRefund(world, service);

    expect(
      await refusalOf(service.correctRefund(world.admin.id, correctInput({ amountPaise: 10_001 }))),
    ).toEqual({
      reason: "refund_above_advance",
      details: { advancePaise: 7_000, increasePaise: 7_001 },
    });
    expect(await db.select().from(refundEventsTable)).toHaveLength(1);
    expect(outcomes).toHaveLength(1);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(-7_000);
  });

  it("down is always allowed, even when the Customer is now Pending: a Credit", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new RefundService();
    const { correctInput } = await addedRefund(world, service);
    // A Bill after the Refund (on the GatePass day) leaves the Customer Pending.
    vi.setSystemTime(new Date("2026-10-25T07:00:00Z"));
    await placeBookNowBill(world);
    vi.setSystemTime(new Date("2026-10-27T06:00:00Z"));
    expect((await ledger.getBalance(world.customer.id)).state).toBe("pending");

    const result = await service.correctRefund(
      world.admin.id,
      correctInput({ amountPaise: 1_000 }),
    );

    expect(result.balancePaise).toBe(-7_000 + BOOK_NOW_TOTAL_PAISE - 2_000);
    expect((await ledgerRowsOf(world.customer.id)).at(-1)).toMatchObject({
      entryType: "refund_adjusted",
      side: "credit",
      amountPaise: 2_000,
    });
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("to ₹0 keeps the Refund and its number; the Ledger nets to 0", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const service = new RefundService();
    const { added, correctInput } = await addedRefund(world, service);

    const result = await service.correctRefund(
      world.admin.id,
      correctInput({ amountPaise: 0, reason: "Payout failed" }),
    );

    expect(result.balancePaise).toBe(-10_000);
    const refundRows = (await ledgerRowsOf(world.customer.id)).filter(
      (row) => row.refundId === added.refundId,
    );
    expect(refundRows.map((row) => [row.entryType, row.side, row.amountPaise])).toEqual([
      ["refund", "debit", 3_000],
      ["refund_adjusted", "credit", 3_000],
    ]);
    expect((await service.getRefundPaper(added.refundId)).refund).toMatchObject({
      number: "MR/26-27/000001",
      amountPaise: 0,
    });
    await expectBalanceMatchesLedger(world.customer.id);
  });

  it("mode or reference only adds an event with no Ledger row, even with no Advance left", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { service, outcomes } = recordingService();
    const { added, correctInput } = await addedRefund(world, service);
    await service.addRefund(world.admin.id, addInput(world, { amountPaise: 7_000 }));
    const rowsBefore = await ledgerRowsOf(world.customer.id);

    const result = await service.correctRefund(
      world.admin.id,
      correctInput({ mode: "bank", reference: "IMPS-5" }),
    );

    expect(result).toMatchObject({ ledgerEntryId: null, differencePaise: 0, balancePaise: 0 });
    expect(await ledgerRowsOf(world.customer.id)).toEqual(rowsBefore);
    expect((await service.getRefundPaper(added.refundId)).refund).toMatchObject({
      mode: "bank",
      reference: "IMPS-5",
    });
    expect(outcomes.at(-1)).toMatchObject({ kind: "refund_corrected", amountChanged: false });
  });

  describe("refuses, writing nothing", () => {
    it("a Correct that changes nothing, and a stale view", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new RefundService();
      const { correctInput } = await addedRefund(world, service);

      expect(
        await refusalOf(service.correctRefund(world.admin.id, correctInput({}))),
      ).toMatchObject({ reason: "nothing_changed" });
      await service.correctRefund(world.admin.id, correctInput({ amountPaise: 2_000 }));
      expect(
        await refusalOf(
          service.correctRefund(world.admin.id, correctInput({ amountPaise: 1_000 })),
        ),
      ).toMatchObject({ reason: "stale_version" });
      expect(await db.select().from(refundEventsTable)).toHaveLength(2);
      expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(-8_000);
    });

    it("a deactivated Customer", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const service = new RefundService();
      const { added, correctInput } = await addedRefund(world, service);
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);

      for (const amountPaise of [1_000, 3_000]) {
        expect(
          await refusalOf(
            service.correctRefund(world.admin.id, correctInput({ amountPaise, mode: "cash" })),
          ),
        ).toMatchObject({ reason: "customer_inactive" });
      }
      expect((await service.getRefundPaper(added.refundId)).actions.canCorrect).toBe(false);
    });
  });
});
