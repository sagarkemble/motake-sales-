import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import {
  billVersionsTable,
  customersTable,
  paymentEventsTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerLedgerService from "../customer-ledger";
import CustomerMessageService from "./index";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import { buildMessageHarness, type MessageHarness } from "../test/customer-message-world";
import { wipeApplicationTables } from "../test/database";
import { buildEinvoicingWorld } from "../test/gst-world";

// Spec J, Spec F's events: Book Now, Pre-order fulfil and field Payment.

const today = "2026-10-25";
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

async function bookNow(world: CheckoutWorld, receivedPaise = 0) {
  return harness.orderService.placeBookNow(world.salesman.id, {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    lines: [
      { sku: world.milk.sku, qty: 3 },
      { sku: world.curd.sku, qty: 1 },
    ],
    payment: { mode: "cash", receivedPaise },
  });
}

async function setCustomer(
  world: CheckoutWorld,
  values: Partial<typeof customersTable.$inferInsert>,
) {
  await db.update(customersTable).set(values).where(eq(customersTable.id, world.customer.id));
}

async function onlyPayment() {
  const [payment] = await db.select().from(paymentsTable);
  const [event] = await db.select().from(paymentEventsTable);
  return { payment: payment!, event: event! };
}

describe("Book Now", () => {
  it("sends the Bill then the Receipt; the Bill's Balance excludes the Payment, the Receipt's includes it", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await setCustomer(world, { shopName: "Shree Dairy", phone: "+91 98224 18224" });

    const placed = await bookNow(world, 5_000);

    const { payment, event } = await onlyPayment();
    const billVersionId = await versionIdOf(placed.billId);
    const billRef = `bill/${placed.billId}/v1`;
    const receiptRef = `payment/${payment.id}/${event.id}`;
    const route = world.route.name;
    expect(harness.gateway.instructions).toEqual([
      {
        idempotencyKey: `bill|${billRef}`,
        kind: "bill",
        to: "+919822418224",
        provider: "whatsapp",
        templateId: "motake_bill_v2",
        language: "mr",
        values: {
          customer: `Shree Dairy, ${route}`,
          route_name: route,
          bill_number: "MB/26-27/000001",
          bill_date: "25 ऑक्टोबर 2026",
          bill_amount: "₹119.00",
          balance_line: "बिलानंतरची बाकी रक्कम: ₹119.00",
        },
        businessRef: billRef,
        attachment: {
          key: `documents/bill-versions/${billVersionId}.pdf`,
          type: "pdf",
          filename: "Motake Bill MB-26-27-000001.pdf",
        },
      },
      {
        idempotencyKey: `receipt|${receiptRef}`,
        kind: "receipt",
        to: "+919822418224",
        provider: "whatsapp",
        templateId: "motake_receipt_v2",
        language: "mr",
        values: {
          customer: `Shree Dairy, ${route}`,
          route_name: route,
          receipt_number: "MP/26-27/000001",
          amount_received: "₹50.00",
          payment_mode: "रोख",
          balance_line: "बाकी रक्कम: ₹69.00",
        },
        businessRef: receiptRef,
        attachment: {
          key: `documents/receipts/${payment.id}/${event.id}.pdf`,
          type: "pdf",
          filename: "Motake Receipt MP-26-27-000001.pdf",
        },
      },
    ]);
    // Value names exactly in template order.
    expect(Object.keys(harness.gateway.instructions[0]!.values)).toEqual([
      "customer",
      "route_name",
      "bill_number",
      "bill_date",
      "bill_amount",
      "balance_line",
    ]);
    expect(harness.documents.calls).toEqual([
      { method: "ensureBillVersionDocument", billVersionId },
      {
        method: "drawPaymentReceipt",
        input: { paymentId: payment.id, postedPaymentEventId: event.id, balanceAfterPaise: 6_900 },
      },
    ]);
  });

  it("kept ₹0 sends the Bill only", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    await bookNow(world);

    expect(harness.gateway.instructions.map((instruction) => instruction.kind)).toEqual(["bill"]);
  });

  it("a Hindi or English Customer gets that language, labels and month; digits stay Latin", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await setCustomer(world, { preferredLanguage: "hi" });
    await bookNow(world, 5_000);

    const [bill, receipt] = harness.gateway.instructions;
    expect(bill).toMatchObject({
      language: "hi",
      values: { bill_date: "25 अक्टूबर 2026", balance_line: "बिल के बाद बकाया राशि: ₹119.00" },
    });
    expect(receipt).toMatchObject({
      language: "hi",
      values: { payment_mode: "नकद", balance_line: "बकाया राशि: ₹69.00" },
    });

    await setCustomer(world, { preferredLanguage: "en" });
    await bookNow(world);
    expect(harness.gateway.instructions[2]).toMatchObject({
      language: "en",
      values: { bill_date: "25 October 2026", balance_line: "Pending Balance: ₹188.00" },
    });
  });

  it("an IRN pending Bill is withheld (no PDF drawn) while its Receipt still goes", async () => {
    const world = await buildEinvoicingWorld({ businessDate: today });

    await bookNow(world, 5_000);

    expect(harness.gateway.instructions.map((instruction) => instruction.kind)).toEqual([
      "receipt",
    ]);
    expect(harness.documents.calls.map((call) => call.method)).toEqual(["drawPaymentReceipt"]);
  });

  it("an IRN refusal from the PDF step withholds the Bill and moves on to the Receipt", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    harness.documents.refuseIrnMissing = true;

    await bookNow(world, 5_000);

    expect(harness.gateway.instructions.map((instruction) => instruction.kind)).toEqual([
      "receipt",
    ]);
  });
});

describe("Pre-order", () => {
  it("place sends nothing; fulfil sends the Bill then the Receipt", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await harness.orderService.placePreOrder(world.salesman.id, {
      customerId: world.customer.id,
      idempotencyKey: randomUUID(),
      scheduledDate: "2026-10-26",
      lines: [{ sku: world.milk.sku, qty: 2 }],
    });
    expect(harness.gateway.calls).toEqual([]);

    vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));
    await harness.orderService.fulfilPreOrder(
      { profileId: world.admin.id, role: "admin" },
      {
        orderId: placed.orderId,
        idempotencyKey: randomUUID(),
        payment: { mode: "upi", receivedPaise: 1_000 },
      },
    );

    expect(harness.gateway.instructions).toEqual([
      expect.objectContaining({
        kind: "bill",
        values: expect.objectContaining({ bill_date: "26 ऑक्टोबर 2026", bill_amount: "₹52.00" }),
      }),
      expect.objectContaining({
        kind: "receipt",
        values: expect.objectContaining({ amount_received: "₹10.00", payment_mode: "UPI" }),
      }),
    ]);
  });
});

describe("field Payment", () => {
  it("sends a Receipt with the Balance after", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await bookNow(world);

    await harness.paymentService.recordFieldPayment(world.salesman.id, {
      customerId: world.customer.id,
      idempotencyKey: randomUUID(),
      mode: "cash",
      receivedPaise: 4_000,
    });

    expect(harness.gateway.instructions[1]).toMatchObject({
      kind: "receipt",
      templateId: "motake_receipt_v2",
      values: { amount_received: "₹40.00", balance_line: "बाकी रक्कम: ₹79.00" },
    });
  });
});

describe("phones", () => {
  it.each([
    ["9822418224", "+919822418224"],
    ["+91 98224 18224", "+919822418224"],
    ["09822418224", "+919822418224"],
  ])("%s goes to %s", async (phone, to) => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await setCustomer(world, { phone });
    await bookNow(world);
    expect(harness.gateway.instructions[0]).toMatchObject({ to });
    expect(harness.gateway.instructions[0]).not.toHaveProperty("skipReason");
  });

  it.each([
    ["", "missing phone"],
    ["982241822", "not a valid Indian mobile"],
    ["5822418224", "not a valid Indian mobile"],
  ])(
    "%j is sent with no phone and the skip reason %s; the sale commits",
    async (phone, skipReason) => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await setCustomer(world, { phone });
      const placed = await bookNow(world);
      expect(placed.billNumber).toBe("MB/26-27/000001");
      expect(harness.gateway.instructions[0]).toMatchObject({ to: null, skipReason });
      expect(harness.gateway.rows[0]).toMatchObject({ status: "skipped", skipReason });
    },
  );
});

describe("delegation", () => {
  it("retries a failed enqueue with the same key and stores one row", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    harness.gateway.enqueueFailures = 2;

    await bookNow(world, 5_000);

    const enqueues = harness.gateway.calls.filter((call) => call.startsWith("enqueue"));
    expect(enqueues).toEqual([
      enqueues[0],
      enqueues[0],
      enqueues[0],
      expect.stringMatching(/^enqueue receipt\|/),
    ]);
    expect(harness.gateway.rows.map((row) => row.instruction.kind)).toEqual(["bill", "receipt"]);
  });

  it("a gateway that always fails leaves the sale committed and stops the chain after the Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    harness.gateway.enqueueAlwaysFails = true;

    const placed = await bookNow(world, 5_000);

    expect(placed.payment?.number).toBe("MP/26-27/000001");
    expect(harness.gateway.calls.filter((call) => call.startsWith("enqueue receipt"))).toEqual([]);
    expect(harness.documents.calls.map((call) => call.method)).toEqual([
      "ensureBillVersionDocument",
    ]);
  });

  it("a PDF draw that fails once is retried and the message goes out", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    harness.documents.failures = 1;

    await bookNow(world);

    expect(harness.documents.calls.map((call) => call.method)).toEqual([
      "ensureBillVersionDocument",
      "ensureBillVersionDocument",
    ]);
    expect(harness.gateway.rows).toHaveLength(1);
  });

  it("a PDF draw that always fails sends nothing after it in that chain; the sale stays", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    harness.documents.alwaysFails = true;

    const placed = await bookNow(world, 5_000);

    expect(placed.billNumber).toBe("MB/26-27/000001");
    expect(harness.documents.calls).toHaveLength(3);
    expect(harness.gateway.rows).toEqual([]);
  });

  it("a K refusal (template_not_verified) is not retried and stops the chain; the sale stays", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    harness.gateway.enqueueRefusal = "template_not_verified";

    const placed = await bookNow(world, 5_000);

    expect(placed.payment?.number).toBe("MP/26-27/000001");
    expect(harness.gateway.calls.filter((call) => call.startsWith("enqueue"))).toHaveLength(1);
  });

  it("a rolled-back sale delegates nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await db
      .update(customersTable)
      .set({ status: "inactive" })
      .where(eq(customersTable.id, world.customer.id));

    await expect(bookNow(world, 5_000)).rejects.toThrow();

    expect(harness.gateway.calls).toEqual([]);
    expect(harness.documents.calls).toEqual([]);
  });

  it("without the notification app, messages are skipped and the sale commits", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const messages = new CustomerMessageService({
      notification: null,
      documents: harness.documents,
    });

    await messages.checkoutListener({
      bill: null,
      payment: {
        paymentId: randomUUID(),
        postedEventId: randomUUID(),
        paymentNumber: "MP/26-27/000009",
        customerId: world.customer.id,
        mode: "cash",
        keptPaise: 100,
        returnedPaise: 0,
        balanceAfterPaise: 0,
      },
    });

    expect(harness.documents.calls).toEqual([]);
  });

  it("an Opening balance sends nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await new CustomerLedgerService().addOpeningBalance(world.admin.id, {
      customerId: world.customer.id,
      side: "pending",
      amountPaise: 10_000,
      reason: "Old book",
    });
    expect(harness.gateway.calls).toEqual([]);
  });
});

async function versionIdOf(billId: string): Promise<string> {
  const [version] = await db
    .select()
    .from(billVersionsTable)
    .where(eq(billVersionsTable.billId, billId));
  return version!.id;
}
