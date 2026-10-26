import { randomUUID } from "node:crypto";

import { asc, db, eq } from "@repo/database";
import {
  customersTable,
  gatepassesTable,
  orderVersionsTable,
  ordersTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import OrderService from "../orders";
import type { AdminBillOutcome, BillLockHook } from "../shared/bill-events";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import {
  BOOK_NOW_TOTAL_PAISE,
  billAuditRows,
  billItemsOf,
  billNetLedgerPaise,
  expectBalanceMatchesLedger,
  ledgerRowsOf,
  noteLinesOf,
  notesOf,
  placeBookNowBill,
  refusalOf,
  soldQtyByVariety,
  versionsOf,
} from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import AdminBillService from "./index";

const today = "2026-10-25";
const tomorrow = "2026-10-26";
const outcomes: AdminBillOutcome[] = [];
const adminBillService = new AdminBillService((outcome) => {
  outcomes.push(outcome);
});
const orderService = new OrderService();

beforeEach(async () => {
  await wipeApplicationTables();
  outcomes.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function orderOf(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  return order!;
}

async function orderVersionsOf(orderId: string) {
  return db
    .select()
    .from(orderVersionsTable)
    .where(eq(orderVersionsTable.orderId, orderId))
    .orderBy(asc(orderVersionsTable.versionNumber));
}

async function placePreOrder(world: CheckoutWorld) {
  return orderService.placePreOrder(world.salesman.id, {
    customerId: world.customer.id,
    scheduledDate: tomorrow,
    idempotencyKey: randomUUID(),
    lines: [{ sku: world.milk.sku, qty: 2 }],
  });
}

describe("AdminBillService.cancelBill", () => {
  it("voids a Book Now: one GST Credit Note for the whole Bill, stock back to the active GatePass, order cancelled, Payment kept", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world, { receivedPaise: 5_000 });
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 3,
      [world.curd.id]: 1,
    });
    outcomes.length = 0;

    const result = await adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Billed to the wrong shop",
    });

    const [creditNote] = await notesOf(placed.billId);
    expect(creditNote).toMatchObject({
      kind: "gst_credit_note",
      number: "MC/26-27/000001",
      amountPaise: BOOK_NOW_TOTAL_PAISE,
      reason: "Billed to the wrong shop",
      pdfKey: null,
    });
    expect((await noteLinesOf(creditNote!.id)).map((line) => line.quantity).sort()).toEqual([1, 3]);
    expect(result).toEqual({
      billId: placed.billId,
      creditNote: {
        noteId: creditNote!.id,
        number: "MC/26-27/000001",
        kind: "gst_credit_note",
        amountPaise: BOOK_NOW_TOTAL_PAISE,
      },
      stockRestored: true,
      // The ₹50.00 kept stays as Advance.
      balancePaise: -5_000,
    });
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(-5_000);
    expect(await db.select().from(paymentsTable)).toHaveLength(1);
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 0,
      [world.curd.id]: 0,
    });
    // The Bill keeps its number, lines and history; no new version.
    expect(await versionsOf(placed.billId)).toHaveLength(1);
    expect(await billItemsOf(placed.billId)).toHaveLength(2);

    const order = await orderOf(placed.orderId);
    expect(order).toMatchObject({ status: "cancelled", cancelledBy: world.admin.id });
    const orderVersions = await orderVersionsOf(placed.orderId);
    expect(orderVersions.at(-1)).toMatchObject({
      versionNumber: orderVersions.length,
      reason: "Billed to the wrong shop",
      actorId: world.admin.id,
      header: expect.objectContaining({
        status: "cancelled",
        route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
      }),
    });

    expect(await billAuditRows(placed.billId)).toEqual([
      expect.objectContaining({
        action: "cancelled",
        actorId: world.admin.id,
        customerId: world.customer.id,
        reason: "Billed to the wrong shop",
        payload: {
          creditNoteId: creditNote!.id,
          creditNoteNumber: "MC/26-27/000001",
          amountPaise: BOOK_NOW_TOTAL_PAISE,
          stockRestored: true,
        },
      }),
    ]);
    expect(outcomes).toEqual([
      {
        kind: "bill_cancelled",
        customerId: world.customer.id,
        reason: "Billed to the wrong shop",
        balanceAfterPaise: -5_000,
        billId: placed.billId,
        billNumber: placed.billNumber,
        creditNote: result.creditNote,
      },
    ]);
  });

  it("credits only what is left after earlier Notes, so the Bill nets to zero", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    const milkLine = (await billItemsOf(placed.billId)).find(
      (item) => item.varietyId === world.milk.id,
    )!;
    const partial = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "One Milk leaked",
    });
    const result = await adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Shop closed down",
    });

    expect(result.creditNote.number).toBe("MC/26-27/000002");
    expect(result.creditNote.amountPaise).toBe(BOOK_NOW_TOTAL_PAISE - partial.amountPaise);
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
    // Stock: Milk 3 − 1 already credited → 2 back; Curd 1 back.
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 1,
      [world.curd.id]: 0,
    });
  });

  it("after a Correct, the Credit Note covers the corrected total", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    const milkLine = (await billItemsOf(placed.billId)).find(
      (item) => item.varietyId === world.milk.id,
    )!;
    const corrected = await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 5 }],
      reason: "Two more Milk",
    });

    const result = await adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 2,
      reason: "Wrong shop",
    });

    expect(result.creditNote.amountPaise).toBe(corrected.totalPaise);
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
    // Stock back is capped at the order line's 3, not the corrected 5.
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 0,
      [world.curd.id]: 0,
    });
  });

  it("writes a Commercial Credit Note after the deadline and restores nothing once the GatePass is closed", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    await db
      .update(gatepassesTable)
      .set({ status: "closed" })
      .where(eq(gatepassesTable.id, world.gatepass.id));
    vi.setSystemTime(new Date("2027-12-01T06:00:00Z"));

    const result = await adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    expect(result).toMatchObject({
      stockRestored: false,
      creditNote: { kind: "commercial_credit_note", number: "MC/27-28/000001" },
    });
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 3,
      [world.curd.id]: 1,
    });
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
    expect((await orderOf(placed.orderId)).status).toBe("cancelled");
  });

  it("voids an office Bill with no order or stock", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const raised = await adminBillService.raiseBill(world.admin.id, {
      customerId: world.customer.id,
      lines: [{ varietyId: world.milk.id, quantity: 3 }],
      reason: "Office sale",
    });

    const result = await adminBillService.cancelBill(world.admin.id, {
      billId: raised.billId,
      expectedVersionNumber: 1,
      reason: "Raised twice",
    });

    expect(result.stockRestored).toBe(false);
    expect(result.creditNote.amountPaise).toBe(raised.totalPaise);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
    expect(await billAuditRows(raised.billId)).toHaveLength(1);
    expect((await ledgerRowsOf(world.customer.id)).map((row) => row.entryType)).toEqual([
      "bill",
      "credit_note",
    ]);
  });

  describe("refuses, writing nothing and sending nothing", () => {
    it("a Bill already cancelled", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const placed = await placeBookNowBill(world);
      const cancel = () =>
        adminBillService.cancelBill(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 1,
          reason: "Wrong shop",
        });
      await cancel();
      outcomes.length = 0;

      expect(await refusalOf(cancel())).toMatchObject({ reason: "already_cancelled" });
      expect(await notesOf(placed.billId)).toHaveLength(1);
      expect(await billAuditRows(placed.billId)).toHaveLength(1);
      expect(outcomes).toEqual([]);
    });

    it("a stale version", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const placed = await placeBookNowBill(world);
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.cancelBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 2,
            reason: "Wrong shop",
          }),
        ),
      ).toEqual({ reason: "stale_version", details: { latestVersionNumber: 1 } });
      expect(await notesOf(placed.billId)).toEqual([]);
      expect((await orderOf(placed.orderId)).status).not.toBe("cancelled");
      expect(outcomes).toEqual([]);
    });

    it("a Bill the lock hook closes (asked with action cancel)", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const placed = await placeBookNowBill(world);
      const asked: string[] = [];
      const lockHook: BillLockHook = async ({ action }) => {
        asked.push(action);
        return { allowed: false, reason: "irn_recorded", message: "Cancel the IRN on the portal." };
      };

      expect(
        await refusalOf(
          new AdminBillService(undefined, lockHook).cancelBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            reason: "Wrong shop",
          }),
        ),
      ).toEqual({ reason: "bill_locked", details: { lockReason: "irn_recorded" } });
      expect(asked).toEqual(["cancel"]);
      expect(await notesOf(placed.billId)).toEqual([]);
      expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
        [world.milk.id]: 3,
        [world.curd.id]: 1,
      });
    });

    it("a deactivated Customer's Bill", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const placed = await placeBookNowBill(world);
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.cancelBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            reason: "Wrong shop",
          }),
        ),
      ).toMatchObject({ reason: "customer_inactive" });
      expect(await notesOf(placed.billId)).toEqual([]);
      expect(outcomes).toEqual([]);
    });
  });

  it("runs in the caller's transaction for Spec I's portal cancellation, asking the hook with portal_cancel", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    const asked: string[] = [];
    const service = new AdminBillService(undefined, async ({ action }) => {
      asked.push(action);
      return { allowed: true };
    });

    const run = await db.transaction((transaction) =>
      service.cancelBillInTransaction(
        world.admin.id,
        { billId: placed.billId, reason: "IRN cancelled on the portal", action: "portal_cancel" },
        transaction,
      ),
    );

    expect(asked).toEqual(["portal_cancel"]);
    expect(run.outcome).toMatchObject({ kind: "bill_cancelled", billId: placed.billId });
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
  });

  it("two Cancels at once: one wins, the other is refused as already cancelled", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    const cancel = () =>
      adminBillService.cancelBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      });

    const settled = await Promise.allSettled([cancel(), cancel()]);

    expect(settled.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((outcome) => outcome.status === "rejected")!;
    expect(
      await refusalOf(Promise.reject((rejected as PromiseRejectedResult).reason)),
    ).toMatchObject({ reason: "already_cancelled" });
    expect(await notesOf(placed.billId)).toHaveLength(1);
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 0,
      [world.curd.id]: 0,
    });
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
  });
});

describe("AdminBillService.cancelPreOrder", () => {
  it("cancels an unfulfilled Pre-order with a new order version and nothing else", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const preOrder = await placePreOrder(world);
    const versionsBefore = await orderVersionsOf(preOrder.orderId);

    const result = await adminBillService.cancelPreOrder(world.admin.id, {
      orderId: preOrder.orderId,
      reason: "Shop asked to cancel",
    });

    expect(result).toEqual({ orderId: preOrder.orderId, balancePaise: 0 });
    expect(await orderOf(preOrder.orderId)).toMatchObject({
      status: "cancelled",
      cancelledBy: world.admin.id,
    });
    const versions = await orderVersionsOf(preOrder.orderId);
    expect(versions).toHaveLength(versionsBefore.length + 1);
    expect(versions.at(-1)).toMatchObject({
      reason: "Shop asked to cancel",
      header: expect.objectContaining({
        route: (versionsBefore.at(-1)!.header as { route: unknown }).route,
      }),
    });
    expect(await ledgerRowsOf(world.customer.id)).toEqual([]);
    expect(outcomes).toEqual([
      {
        kind: "pre_order_cancelled",
        customerId: world.customer.id,
        reason: "Shop asked to cancel",
        balanceAfterPaise: 0,
        orderId: preOrder.orderId,
      },
    ]);
  });

  it("refuses a Book Now, a fulfilled or cancelled Pre-order and a deactivated Customer", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const bookNow = await placeBookNowBill(world);
    const fulfilled = await placePreOrder(world);
    await db
      .update(ordersTable)
      .set({ status: "fulfilled", fulfilledAt: new Date() })
      .where(eq(ordersTable.id, fulfilled.orderId));
    const open = await placePreOrder(world);
    const cancel = (orderId: string) =>
      adminBillService.cancelPreOrder(world.admin.id, { orderId, reason: "Cancel" });
    outcomes.length = 0;

    expect(await refusalOf(cancel(bookNow.orderId))).toMatchObject({ reason: "not_a_pre_order" });
    expect(await refusalOf(cancel(fulfilled.orderId))).toMatchObject({
      reason: "already_fulfilled",
    });
    // Deactivation refuses while a Pre-order is open, so mark the Customer inactive directly.
    await db
      .update(customersTable)
      .set({ status: "inactive" })
      .where(eq(customersTable.id, world.customer.id));
    expect(await refusalOf(cancel(open.orderId))).toMatchObject({ reason: "customer_inactive" });
    expect((await orderOf(open.orderId)).status).not.toBe("cancelled");
    expect(outcomes).toEqual([]);
  });

  it("refuses a Pre-order already cancelled", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const preOrder = await placePreOrder(world);
    await adminBillService.cancelPreOrder(world.admin.id, {
      orderId: preOrder.orderId,
      reason: "Cancel",
    });

    expect(
      await refusalOf(
        adminBillService.cancelPreOrder(world.admin.id, {
          orderId: preOrder.orderId,
          reason: "Cancel",
        }),
      ),
    ).toMatchObject({ reason: "already_cancelled" });
  });
});

describe("AdminBillService.cancelOrder (the orders cancel entry)", () => {
  it("cancels an unfulfilled Pre-order, or a Book Now's Bill at its latest version", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const preOrder = await placePreOrder(world);
    const bookNow = await placeBookNowBill(world);

    const cancelledPreOrder = await adminBillService.cancelOrder(world.admin.id, {
      orderId: preOrder.orderId,
      reason: "Shop asked",
    });
    const cancelledBookNow = await adminBillService.cancelOrder(world.admin.id, {
      orderId: bookNow.orderId,
      reason: "Wrong shop",
    });

    expect(cancelledPreOrder.status).toBe("cancelled");
    expect(cancelledBookNow.status).toBe("cancelled");
    expect(await billNetLedgerPaise(bookNow.billId)).toBe(0);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      "pre_order_cancelled",
      "bill_cancelled",
    ]);
  });
});
