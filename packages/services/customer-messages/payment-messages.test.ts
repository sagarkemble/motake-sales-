import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { paymentEventsTable, refundEventsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LedgerService from "../ledger";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import { buildMessageHarness, type MessageHarness } from "../test/customer-message-world";
import { wipeApplicationTables } from "../test/database";

// Spec J, Spec H's outcomes: Admin Add Payment, Payment Correct, Add Refund and Refund Correct.

const today = "2026-10-25";
// Each case writes a Bill or Payment through the real services and then its messages; against a
// remote test database that is well past the 30 s default.
vi.setConfig({ testTimeout: 180_000 });

let harness: MessageHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
  harness = buildMessageHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

async function open(world: CheckoutWorld, direction: "pending" | "advance", amountPaise: number) {
  await new LedgerService().setOpeningBalance({
    customerId: world.customer.id,
    direction,
    amountPaise,
    reason: "Carried over",
    actorId: world.admin.id,
  });
}

async function addPayment(world: CheckoutWorld, keptPaise: number) {
  return harness.paymentService.addPayment(world.admin.id, {
    customerId: world.customer.id,
    mode: "bank",
    keptPaise,
    reference: "NEFT-1",
    reason: "Paid at the office",
    idempotencyKey: randomUUID(),
  });
}

async function eventsOf(paymentId: string) {
  return db.select().from(paymentEventsTable).where(eq(paymentEventsTable.paymentId, paymentId));
}

describe("Admin Add Payment", () => {
  it("sends a Receipt with its PDF and the Balance after", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await open(world, "pending", 30_000);

    const added = await addPayment(world, 10_000);

    const [posted] = await eventsOf(added.paymentId);
    const ref = `payment/${added.paymentId}/${posted!.id}`;
    expect(harness.gateway.instructions).toEqual([
      {
        idempotencyKey: `receipt|${ref}`,
        kind: "receipt",
        to: expect.any(String),
        provider: "whatsapp",
        templateId: "motake_receipt_v2",
        language: "mr",
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          receipt_number: added.number,
          amount_received: "₹100.00",
          payment_mode: "बँक",
          balance_line: "बाकी रक्कम: ₹200.00",
        },
        businessRef: ref,
        attachment: {
          key: `documents/receipts/${added.paymentId}/${posted!.id}.pdf`,
          type: "pdf",
          filename: `Motake Receipt ${added.number.replaceAll("/", "-")}.pdf`,
        },
      },
    ]);
    expect(harness.documents.calls).toEqual([
      {
        method: "drawPaymentReceipt",
        input: {
          paymentId: added.paymentId,
          postedPaymentEventId: posted!.id,
          balanceAfterPaise: 20_000,
        },
      },
    ]);
  });
});

describe("Payment Correct", () => {
  it("a kept change sends the Payment corrected update; mode or reference only sends nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await open(world, "pending", 30_000);
    const added = await addPayment(world, 20_000);
    const [posted] = await eventsOf(added.paymentId);

    const corrected = await harness.paymentService.correctPayment(world.admin.id, {
      paymentId: added.paymentId,
      expectedLatestEventId: posted!.id,
      keptPaise: 15_000,
      mode: "bank",
      reference: "NEFT-1",
      reason: "Cash counted\ntwice",
    });

    const ref = `payment/${added.paymentId}/${corrected.eventId}`;
    expect(harness.gateway.instructions.slice(1)).toEqual([
      {
        idempotencyKey: `account_update|${ref}`,
        kind: "account_update",
        to: expect.any(String),
        provider: "whatsapp",
        templateId: "motake_payment_corrected_v2",
        language: "mr",
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          receipt_number: added.number,
          previous_amount: "₹200.00",
          corrected_amount: "₹150.00",
          difference: "₹50.00",
          reason: "Cash counted twice",
          balance_line: "आता बाकी रक्कम: ₹150.00",
        },
        businessRef: ref,
      },
    ]);

    await harness.paymentService.correctPayment(world.admin.id, {
      paymentId: added.paymentId,
      expectedLatestEventId: corrected.eventId,
      keptPaise: 15_000,
      mode: "upi",
      reference: "UPI-2",
      reason: "Paid by UPI, not bank",
    });
    expect(harness.gateway.instructions).toHaveLength(2);
  });
});

describe("Refunds", () => {
  it("Add and an amount Correct send the Refund update (the corrected amount); mode only sends nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await open(world, "advance", 10_000);

    const added = await harness.refundService.addRefund(world.admin.id, {
      customerId: world.customer.id,
      mode: "upi",
      amountPaise: 3_000,
      reference: "UPI-REF-1",
      reason: "Advance paid back",
      idempotencyKey: randomUUID(),
    });
    const [posted] = await db
      .select()
      .from(refundEventsTable)
      .where(eq(refundEventsTable.refundId, added.refundId));
    const corrected = await harness.refundService.correctRefund(world.admin.id, {
      refundId: added.refundId,
      expectedLatestEventId: posted!.id,
      amountPaise: 2_000,
      mode: "upi",
      reference: "UPI-REF-1",
      reason: "Paid back ₹20 only",
    });
    await harness.refundService.correctRefund(world.admin.id, {
      refundId: added.refundId,
      expectedLatestEventId: corrected.eventId,
      amountPaise: 2_000,
      mode: "cash",
      reference: null,
      reason: "Paid in cash",
    });

    expect(harness.gateway.instructions).toEqual([
      expect.objectContaining({
        idempotencyKey: `account_update|refund/${added.refundId}/${posted!.id}`,
        kind: "account_update",
        templateId: "motake_refund_v2",
        businessRef: `refund/${added.refundId}/${posted!.id}`,
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          refund_number: added.number,
          refund_amount: "₹30.00",
          refund_mode: "UPI",
          balance_line: "शिल्लक आगाऊ रक्कम: ₹70.00",
        },
      }),
      expect.objectContaining({
        businessRef: `refund/${added.refundId}/${corrected.eventId}`,
        values: expect.objectContaining({
          refund_amount: "₹20.00",
          balance_line: "शिल्लक आगाऊ रक्कम: ₹80.00",
        }),
      }),
    ]);
    expect(harness.gateway.instructions[0]).not.toHaveProperty("attachment");
  });
});
