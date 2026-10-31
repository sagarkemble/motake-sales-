import { randomUUID } from "node:crypto";

import { count, db, eq } from "@repo/database";
import {
  customersTable,
  ledgerEntriesTable,
  paymentEventsTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { billItemsOf, refusalOf } from "../test/admin-bill-world";
import {
  buildCheckoutWorld,
  buildGatepass,
  buildPayment,
  buildRoute,
  buildSalesman,
  type CheckoutWorld,
} from "../test/builders";
import { buildMessageHarness, type MessageHarness } from "../test/customer-message-world";
import { wipeApplicationTables } from "../test/database";

// Spec J's Resend, Send latest Bill and status reads. No money row is ever written.

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

const admin = (world: CheckoutWorld) => ({ profileId: world.admin.id, role: "admin" as const });
const salesman = (profileId: string) => ({ profileId, role: "salesman" as const });

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

async function setPhone(world: CheckoutWorld, phone: string) {
  await db.update(customersTable).set({ phone }).where(eq(customersTable.id, world.customer.id));
}

async function moneyRowCounts() {
  const [payments] = await db.select({ total: count() }).from(paymentsTable);
  const [events] = await db.select({ total: count() }).from(paymentEventsTable);
  const [ledger] = await db.select({ total: count() }).from(ledgerEntriesTable);
  return [payments!.total, events!.total, ledger!.total];
}

// A new Bill version: one more Milk.
async function qtyCorrect(world: CheckoutWorld, billId: string, expectedVersionNumber: number) {
  const milkLine = (await billItemsOf(billId)).find((item) => item.varietyId === world.milk.id)!;
  await harness.adminBillService.correctBill(world.admin.id, {
    billId,
    expectedVersionNumber,
    lines: [{ lineId: milkLine.id, quantity: milkLine.quantity + 1 }],
    reason: "One more Milk",
  });
}

describe("resend", () => {
  it("Admin resends a delivered Receipt to the current phone; no money row is written", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await bookNow(world, 5_000);
    const receipt = harness.gateway.rows[1]!;
    harness.gateway.setStatus(receipt.notificationId, "delivered");
    await setPhone(world, "+91 70000 12345");
    const before = await moneyRowCounts();

    const result = await harness.messages.resend(admin(world), {
      notificationId: receipt.notificationId,
    });

    expect(result).toEqual({ notificationId: receipt.notificationId, status: "pending" });
    expect(receipt.resends).toEqual(["+917000012345"]);
    expect(await moneyRowCounts()).toEqual(before);
  });

  it("refuses Resend and Send latest Bill for a deactivated Customer; statuses stay readable", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world, 5_000);
    const receipt = harness.gateway.rows[1]!;
    harness.gateway.setStatus(receipt.notificationId, "delivered");
    await db
      .update(customersTable)
      .set({ status: "inactive" })
      .where(eq(customersTable.id, world.customer.id));

    expect(
      (
        await refusalOf(
          harness.messages.resend(admin(world), { notificationId: receipt.notificationId }),
        )
      ).reason,
    ).toBe("customer_inactive");
    expect(
      (await refusalOf(harness.messages.sendLatestBill(admin(world), { billId: placed.billId })))
        .reason,
    ).toBe("customer_inactive");
    expect(receipt.resends).toEqual([]);
    await expect(
      harness.messages.listForDocument(admin(world), { billId: placed.billId }),
    ).resolves.not.toHaveLength(0);
  });

  it("refuses while pending", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await bookNow(world);

    const refusal = await refusalOf(
      harness.messages.resend(admin(world), {
        notificationId: harness.gateway.rows[0]!.notificationId,
      }),
    );

    expect(refusal.reason).toBe("message_pending");
    expect(harness.gateway.calls.filter((call) => call.startsWith("resend"))).toEqual([]);
  });

  it("a skipped message is refused until the phone is fixed, then resent with the new phone", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await setPhone(world, "");
    await bookNow(world);
    const bill = harness.gateway.rows[0]!;
    expect(bill).toMatchObject({ status: "skipped", skipReason: "missing phone" });

    const refusal = await refusalOf(
      harness.messages.resend(admin(world), { notificationId: bill.notificationId }),
    );
    expect(refusal).toEqual({ reason: "phone_unusable", details: { skipReason: "missing phone" } });

    await setPhone(world, "09822418224");
    await harness.messages.resend(admin(world), { notificationId: bill.notificationId });
    expect(bill.resends).toEqual(["+919822418224"]);
  });

  it("a salesman resends only with an Active GatePass on the Customer's current Route", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await bookNow(world);
    const bill = harness.gateway.rows[0]!;
    harness.gateway.setStatus(bill.notificationId, "failed");

    await harness.messages.resend(salesman(world.salesman.id), {
      notificationId: bill.notificationId,
    });
    expect(bill.resends).toHaveLength(1);
    harness.gateway.setStatus(bill.notificationId, "failed");

    const { profile: offRoute } = await buildSalesman();
    await buildGatepass({
      salesmanId: offRoute.id,
      issuedBy: world.admin.id,
      routeId: (await buildRoute()).id,
      businessDate: today,
      lines: [],
    });
    const { profile: noGatepass } = await buildSalesman();

    expect(
      (
        await refusalOf(
          harness.messages.resend(salesman(offRoute.id), { notificationId: bill.notificationId }),
        )
      ).reason,
    ).toBe("customer_not_on_route");
    expect(
      (
        await refusalOf(
          harness.messages.resend(salesman(noGatepass.id), { notificationId: bill.notificationId }),
        )
      ).reason,
    ).toBe("no_active_gatepass");
    expect(bill.resends).toHaveLength(1);
  });

  it("refuses an older Bill version, pointing to Send latest Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world);
    const v1 = harness.gateway.rows[0]!;
    harness.gateway.setStatus(v1.notificationId, "delivered");
    await qtyCorrect(world, placed.billId, 1);

    const error = await harness.messages
      .resend(admin(world), { notificationId: v1.notificationId })
      .catch((caught: Error) => caught);

    expect(error).toMatchObject({ message: expect.stringContaining("Send latest Bill") });
    expect((await refusalOf(Promise.reject(error))).reason).toBe("not_latest_bill");
  });

  it("a template_superseded refusal comes back as the wording-changed refusal; a Bill adds the Send latest Bill pointer", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await bookNow(world, 5_000);
    const [bill, receipt] = harness.gateway.rows;
    harness.gateway.setStatus(bill!.notificationId, "delivered");
    harness.gateway.setStatus(receipt!.notificationId, "delivered");
    harness.gateway.setTemplateVersion("motake_bill_v2", "mr", 2);
    harness.gateway.setTemplateVersion("motake_receipt_v2", "mr", 2);

    const billError = await harness.messages
      .resend(admin(world), { notificationId: bill!.notificationId })
      .catch((caught: Error) => caught);
    const receiptError = await harness.messages
      .resend(admin(world), { notificationId: receipt!.notificationId })
      .catch((caught: Error) => caught);

    expect(billError).toMatchObject({
      message:
        "The message wording has changed since this was sent, so it cannot be resent. Use Send latest Bill.",
    });
    expect(receiptError).toMatchObject({
      message: "The message wording has changed since this was sent, so it cannot be resent.",
    });
    expect((await refusalOf(Promise.reject(receiptError))).reason).toBe("template_superseded");
  });
});

describe("sendLatestBill", () => {
  it("refuses a cancelled Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world);
    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    expect(
      (await refusalOf(harness.messages.sendLatestBill(admin(world), { billId: placed.billId })))
        .reason,
    ).toBe("bill_cancelled");
  });

  it("enqueues the latest Bill when it was never sent, superseding an older unsent version", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world);
    const v1 = harness.gateway.rows[0]!;
    harness.gateway.enqueueAlwaysFails = true;
    await qtyCorrect(world, placed.billId, 1);
    harness.gateway.enqueueAlwaysFails = false;
    // v1 was skipped by the failed Correct chain's supersede step.
    harness.gateway.setStatus(v1.notificationId, "pending");

    const result = await harness.messages.sendLatestBill(admin(world), { billId: placed.billId });

    const latest = harness.gateway.rowByKey(`bill|bill/${placed.billId}/v2`);
    expect(result).toEqual({ notificationId: latest.notificationId, status: "pending" });
    expect(v1.status).toBe("skipped");
    expect(latest.instruction.attachment).toMatchObject({ type: "pdf" });
    expect(harness.documents.calls.at(-1)).toMatchObject({ method: "ensureBillVersionDocument" });
  });

  it("resends the existing latest row; refuses while it is pending", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world);
    const latest = harness.gateway.rows[0]!;

    expect(
      (await refusalOf(harness.messages.sendLatestBill(admin(world), { billId: placed.billId })))
        .reason,
    ).toBe("message_pending");

    harness.gateway.setStatus(latest.notificationId, "read");
    const result = await harness.messages.sendLatestBill(admin(world), { billId: placed.billId });

    expect(result.notificationId).toBe(latest.notificationId);
    expect(latest.resends).toHaveLength(1);
    expect(harness.gateway.rows).toHaveLength(1);
  });

  it("after a newer Bill template, sends a fresh message under |tv{n}, then resends that one; reads treat it as latest", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world);
    const original = harness.gateway.rows[0]!;
    harness.gateway.setStatus(original.notificationId, "delivered");
    harness.gateway.setTemplateVersion("motake_bill_v2", "mr", 2);
    const before = await moneyRowCounts();

    const fresh = await harness.messages.sendLatestBill(admin(world), { billId: placed.billId });

    const tvKey = `bill|bill/${placed.billId}/v1|tv2`;
    const tvRow = harness.gateway.rowByKey(tvKey);
    expect(fresh).toEqual({ notificationId: tvRow.notificationId, status: "pending" });
    expect(tvRow.instruction.attachment).toEqual(original.instruction.attachment);

    harness.gateway.setStatus(tvRow.notificationId, "delivered");
    const again = await harness.messages.sendLatestBill(admin(world), { billId: placed.billId });
    expect(again.notificationId).toBe(tvRow.notificationId);
    expect(tvRow.resends).toHaveLength(1);
    expect(harness.gateway.rows).toHaveLength(2);
    expect(await moneyRowCounts()).toEqual(before);

    const statuses = await harness.messages.listForDocument(admin(world), {
      billId: placed.billId,
    });
    expect(statuses.map((status) => [status.notificationId, status.latestBill]).sort()).toEqual(
      [
        [original.notificationId, true],
        [tvRow.notificationId, true],
      ].sort(),
    );
    harness.gateway.setStatus(tvRow.notificationId, "delivered");
    await harness.messages.resend(admin(world), { notificationId: tvRow.notificationId });
    expect(tvRow.resends).toHaveLength(2);
  });
});

describe("status reads", () => {
  it("lists a Bill's messages (versions, update, cancellation, Notes) newest first, flagging the latest Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world, 5_000);
    await qtyCorrect(world, placed.billId, 1);
    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 2,
      reason: "Wrong shop",
    });

    const statuses = await harness.messages.listForDocument(admin(world), {
      billId: placed.billId,
    });

    expect(statuses.map((status) => [status.kind, status.businessRef, status.latestBill])).toEqual([
      ["cancellation", `bill/${placed.billId}/cancel`, false],
      ["account_update", `bill/${placed.billId}/v2`, false],
      ["bill", `bill/${placed.billId}/v2`, true],
      ["bill", `bill/${placed.billId}/v1`, false],
    ]);
    expect(statuses[3]).toMatchObject({ status: "skipped", skipReason: "superseded: newer Bill" });
    expect(statuses[0]).not.toHaveProperty("idempotencyKey");

    const [payment] = await db.select().from(paymentsTable);
    const receipts = await harness.messages.listForDocument(admin(world), {
      paymentId: payment!.id,
    });
    expect(receipts.map((status) => status.kind)).toEqual(["receipt"]);
  });

  it("a salesman reads a paper's messages only with an Active GatePass on the Customer's current Route", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await bookNow(world);

    const statuses = await harness.messages.listForDocument(salesman(world.salesman.id), {
      billId: placed.billId,
    });
    expect(statuses.map((status) => status.kind)).toEqual(["bill"]);

    const { profile: offRoute } = await buildSalesman();
    await buildGatepass({
      salesmanId: offRoute.id,
      issuedBy: world.admin.id,
      routeId: (await buildRoute()).id,
      businessDate: today,
      lines: [],
    });
    const { profile: noGatepass } = await buildSalesman();

    expect(
      (
        await refusalOf(
          harness.messages.listForDocument(salesman(offRoute.id), { billId: placed.billId }),
        )
      ).reason,
    ).toBe("customer_not_on_route");
    expect(
      (
        await refusalOf(
          harness.messages.listForDocument(salesman(noGatepass.id), { billId: placed.billId }),
        )
      ).reason,
    ).toBe("no_active_gatepass");
  });

  it("lists a Customer's history across Bills, Payments and Refunds, asking K 200 refs at a time", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await bookNow(world, 5_000);
    const payment = await buildPayment({
      customer: world.customer,
      actorId: world.admin.id,
      keptPaise: 100,
    });
    await db.insert(paymentEventsTable).values(
      Array.from({ length: 205 }, () => ({
        paymentId: payment.id,
        kind: "adjusted" as const,
        amountKeptPaise: 100,
        previousKeptPaise: 100,
        differencePaise: 0,
        mode: "cash" as const,
        actorId: world.admin.id,
        occurredAt: new Date(),
      })),
    );

    const history = await harness.messages.listForCustomer({ customerId: world.customer.id });

    expect(history.map((status) => status.kind)).toEqual(["receipt", "bill"]);
    expect(harness.gateway.calls.filter((call) => call.startsWith("list")).slice(-2)).toEqual([
      "list 200",
      expect.stringMatching(/^list \d+$/),
    ]);
  });
});
