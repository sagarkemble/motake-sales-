import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import PaymentService from "../payments";
import RefundService from "../refunds";
import { buildCheckoutWorld } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import CustomerLedgerService from "./index";

const customerLedgerService = new CustomerLedgerService();
const paymentService = new PaymentService();
const refundService = new RefundService();
const today = "2026-10-25";

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CustomerLedgerService.getOpeningPaper", () => {
  it("shows side, amount, date, reason and who set it, also for a deactivated Customer", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const opening = await customerLedgerService.addOpeningBalance(world.admin.id, {
      customerId: world.customer.id,
      side: "advance",
      amountPaise: 20_000,
      reason: "Advance paid in cash before go-live",
      openingDate: "2026-10-20",
    });
    await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);

    expect(await customerLedgerService.getOpeningPaper(world.customer.id)).toEqual({
      entryId: opening.entryId,
      side: "advance",
      amountPaise: 20_000,
      date: "2026-10-20",
      occurredAt: new Date("2026-10-19T18:30:00Z"),
      reason: "Advance paid in cash before go-live",
      actorName: world.admin.name,
    });
  });

  it("a Pending Opening reads as pending", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await customerLedgerService.addOpeningBalance(world.admin.id, {
      customerId: world.customer.id,
      side: "pending",
      amountPaise: 5_000,
      reason: "Old book",
    });

    expect(await customerLedgerService.getOpeningPaper(world.customer.id)).toMatchObject({
      side: "pending",
      amountPaise: 5_000,
      date: today,
    });
  });

  it("is null when the Customer has no Opening balance; an unknown Customer is not found", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    expect(await customerLedgerService.getOpeningPaper(world.customer.id)).toBeNull();
    await expect(customerLedgerService.getOpeningPaper(randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("Ledger rows for Payments and Refunds", () => {
  it("show their titles, MP / MR numbers and net amount; adjustments are not rows of their own", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await customerLedgerService.addOpeningBalance(world.admin.id, {
      customerId: world.customer.id,
      side: "pending",
      amountPaise: 1_000,
      reason: "Old book",
    });
    const payment = await paymentService.addPayment(world.admin.id, {
      customerId: world.customer.id,
      mode: "upi",
      keptPaise: 9_000,
      reason: "Paid at the office",
      idempotencyKey: randomUUID(),
    });
    vi.setSystemTime(new Date("2026-10-25T07:00:00Z"));
    const refund = await refundService.addRefund(world.admin.id, {
      customerId: world.customer.id,
      mode: "cash",
      amountPaise: 2_000,
      reason: "Paid back",
      idempotencyKey: randomUUID(),
    });
    vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
    const paymentPaper = await paymentService.getPaymentPaper(payment.paymentId);
    await paymentService.correctPayment(world.admin.id, {
      paymentId: payment.paymentId,
      expectedLatestEventId: paymentPaper.latestEventId,
      keptPaise: 8_000,
      mode: "upi",
      reference: null,
      reason: "Typed ₹10 extra",
    });
    vi.setSystemTime(new Date("2026-10-25T09:00:00Z"));
    const refundPaper = await refundService.getRefundPaper(refund.refundId);
    await refundService.correctRefund(world.admin.id, {
      refundId: refund.refundId,
      expectedLatestEventId: refundPaper.latestEventId,
      amountPaise: 1_500,
      mode: "cash",
      reference: null,
      reason: "Paid ₹5 less",
    });

    const rows = await customerLedgerService.listRows({ customerId: world.customer.id });

    expect(
      rows.items.map((row) => ({
        detailsTitle: row.detailsTitle,
        typeLabel: row.typeLabel,
        number: row.number,
        debitPaise: row.debitPaise,
        creditPaise: row.creditPaise,
        open: row.open,
      })),
    ).toEqual([
      {
        detailsTitle: "Opening balance",
        typeLabel: "Opening balance",
        number: null,
        debitPaise: 1_000,
        creditPaise: null,
        open: { kind: "opening_balance", entryId: expect.any(String) },
      },
      {
        detailsTitle: "Payment received",
        typeLabel: "Payment",
        number: "MP/26-27/000001",
        debitPaise: null,
        creditPaise: 8_000,
        open: { kind: "payment", paymentId: payment.paymentId },
      },
      {
        detailsTitle: "Refund paid",
        typeLabel: "Refund",
        number: "MR/26-27/000001",
        debitPaise: 1_500,
        creditPaise: null,
        open: { kind: "refund", refundId: refund.refundId },
      },
    ]);
    const summary = await customerLedgerService.getSummary(world.customer.id);
    expect(summary.footer).toEqual({
      opening: { debitPaise: 1_000, creditPaise: 0 },
      currentTotal: { debitPaise: 1_500, creditPaise: 8_000 },
      closing: { balancePaise: -5_500, state: "advance", amountPaise: 5_500 },
    });
  });
});
