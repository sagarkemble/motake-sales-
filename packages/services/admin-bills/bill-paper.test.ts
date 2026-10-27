import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { customersTable, sellerSettingsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentService from "../documents";
import { refusalOf as documentRefusalOf } from "../errors";
import OrderService from "../orders";
import type { BillLockHook } from "../shared/bill-events";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import {
  BOOK_NOW_TOTAL_PAISE,
  billItemsOf,
  notesOf,
  placeBookNowBill,
  refusalOf,
  versionsOf,
} from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import { MemoryDocumentStore } from "../test/memory-document-store";
import AdminBillService from "./index";

const today = "2026-10-25";
const adminBillService = new AdminBillService();

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function correctedBill(world: CheckoutWorld) {
  const placed = await placeBookNowBill(world, { notes: "Leave at the back door" });
  const milkLine = (await billItemsOf(placed.billId)).find(
    (item) => item.varietyId === world.milk.id,
  )!;
  await adminBillService.raiseNote(world.admin.id, {
    idempotencyKey: randomUUID(),
    billId: placed.billId,
    expectedVersionNumber: 1,
    kind: "gst_credit_note",
    lines: [{ lineId: milkLine.id, quantity: 1 }],
    reason: "One Milk leaked",
    returnOrDamageOn: today,
  });
  await adminBillService.correctBill(world.admin.id, {
    billId: placed.billId,
    expectedVersionNumber: 1,
    lines: [{ lineId: milkLine.id, quantity: 5 }],
    reason: "Two more Milk",
  });
  return { placed, milkLine };
}

describe("AdminBillService.getBillPaper", () => {
  it("shows the latest version with credited and remaining qty per line, the Notes, history and actions", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await correctedBill(world);

    const paper = await adminBillService.getBillPaper({ billId: placed.billId });

    expect(paper.bill).toMatchObject({
      id: placed.billId,
      number: placed.billNumber,
      billDate: today,
      orderId: placed.orderId,
      billNote: "Leave at the back door",
      cancelled: false,
      irn: null,
      latestVersionNumber: 2,
    });
    expect(paper.customer).toEqual({
      id: world.customer.id,
      shopName: world.customer.shopName,
      status: "active",
    });
    expect(paper.version).toMatchObject({
      versionNumber: 2,
      reason: "Two more Milk",
      actorName: world.admin.name,
      hasPdf: false,
      isLatest: true,
      legalType: "tax_invoice",
    });
    const milk = paper.lines.find((line) => line.id === milkLine.id)!;
    expect(milk).toMatchObject({
      name: "Milk 1 L",
      quantity: 5,
      routePricePaise: 2_499,
      creditedQty: 1,
      remainingQty: 4,
    });
    expect(milk.amountPaise).toBe(milk.taxablePaise + milk.cgstPaise + milk.sgstPaise);
    expect(paper.gstSummary.length).toBeGreaterThan(0);
    expect(paper.notes.map((note) => [note.kind, note.number, note.hasPdf])).toEqual([
      ["gst_credit_note", "MC/26-27/000001", false],
      ["debit_note", "MD/26-27/000001", false],
    ]);
    // Bill history, newest first.
    expect(paper.versions.map((version) => [version.versionNumber, version.reason])).toEqual([
      [2, "Two more Milk"],
      [1, "Raised"],
    ]);
    expect(paper.lock).toEqual({ correct: { allowed: true }, cancel: { allowed: true } });
    expect(paper.actions).toEqual({ canCorrect: true, canCancel: true, canRaiseNote: true });
    expect(paper.balance!.balancePaise).toBeGreaterThan(0);
  });

  it("shows an older version read-only, as issued", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await correctedBill(world);

    const paper = await adminBillService.getBillPaper({ billId: placed.billId, versionNumber: 1 });

    expect(paper.version).toMatchObject({ versionNumber: 1, reason: "Raised", isLatest: false });
    expect(paper.version.totals.totalPaise).toBe(BOOK_NOW_TOTAL_PAISE);
    expect(paper.lines.find((line) => line.id === milkLine.id)!.quantity).toBe(3);
    expect(paper.actions).toEqual({ canCorrect: false, canCancel: false, canRaiseNote: false });
    await expect(
      adminBillService.getBillPaper({ billId: placed.billId, versionNumber: 3 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a cancelled Bill keeps its paper with every action off", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    await adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    const paper = await adminBillService.getBillPaper({ billId: placed.billId });

    expect(paper.bill.cancelled).toBe(true);
    expect(paper.lock).toBeNull();
    expect(paper.actions).toEqual({ canCorrect: false, canCancel: false, canRaiseNote: false });
    expect(paper.lines.every((line) => line.remainingQty === 0)).toBe(true);
  });

  it("shows why Correct and Cancel are off on a locked Bill; Raise Note stays on", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    const lockHook: BillLockHook = async ({ action }) =>
      action === "correct"
        ? { allowed: false, reason: "irn_recorded", message: "Correct the IRN on the portal." }
        : { allowed: true };

    const paper = await new AdminBillService(undefined, lockHook).getBillPaper({
      billId: placed.billId,
    });

    expect(paper.lock!.correct).toEqual({
      allowed: false,
      reason: "irn_recorded",
      message: "Correct the IRN on the portal.",
    });
    expect(paper.actions).toEqual({ canCorrect: false, canCancel: true, canRaiseNote: true });
  });

  it("an office Bill has no order and no Bill note; a deactivated Customer's paper still reads, every action off", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const raised = await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: [{ varietyId: world.curd.id, quantity: 2 }],
      reason: "Office sale",
    });
    await db
      .update(customersTable)
      .set({ status: "inactive" })
      .where(eq(customersTable.id, world.customer.id));

    const paper = await adminBillService.getBillPaper({ billId: raised.billId });

    expect(paper.bill).toMatchObject({ orderId: null, billNote: null });
    expect(paper.version.legalType).toBe("bill_of_supply");
    expect(paper.customer!.status).toBe("inactive");
    expect(paper.balance!.balancePaise).toBe(raised.totalPaise);
    // A deactivated Customer allows reads only, so the paper offers no write.
    expect(paper.actions).toEqual({ canCorrect: false, canCancel: false, canRaiseNote: false });
  });
});

describe("Spec L draws Spec G's papers", () => {
  it("prints a Raise Bill, a corrected version and its Notes (lines pointing at the replaced version)", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed } = await correctedBill(world);
    const store = new MemoryDocumentStore();
    const documents = new DocumentService(store);
    const versions = await versionsOf(placed.billId);

    for (const version of versions) {
      const link = await documents.getDownloadLink(world.admin.id, { billVersionId: version.id });
      expect(link.url).toContain("X-Amz-Signature");
    }
    for (const note of await notesOf(placed.billId)) {
      const link = await documents.getDownloadLink(world.admin.id, { noteId: note.id });
      expect(link.filename).toContain(note.number.replaceAll("/", "-"));
    }
    const paper = await adminBillService.getBillPaper({ billId: placed.billId });
    expect(paper.version.hasPdf).toBe(true);
    expect(paper.notes.every((note) => note.hasPdf)).toBe(true);
  });

  it("refuses a Tax Invoice download with irn_missing while it waits for its IRN", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await db
      .update(customersTable)
      .set({ einvoicingRequired: true })
      .where(eq(customersTable.id, world.customer.id));
    await db.update(sellerSettingsTable).set({ einvoicingRequired: true });
    const raised = await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: [{ varietyId: world.milk.id, quantity: 1 }],
      reason: "Office sale",
    });

    const refused = await documentRefusalOf(
      await new DocumentService(new MemoryDocumentStore())
        .getDownloadLink(world.admin.id, { billVersionId: raised.billVersionId })
        .then(
          () => undefined,
          (error: unknown) => error,
        ),
    );
    expect(refused).toMatchObject({ reason: "irn_missing" });
  });
});

describe("AdminBillService.getPreOrderPaper", () => {
  it("shows the Pre-order with its place-time Route stamp, locked lines and actions", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const preOrder = await new OrderService().placePreOrder(world.salesman.id, {
      customerId: world.customer.id,
      scheduledDate: "2026-10-26",
      idempotencyKey: randomUUID(),
      lines: [{ sku: world.milk.sku, qty: 2 }],
      notes: "Before 7 am",
    });

    const paper = await adminBillService.getPreOrderPaper(preOrder.orderId);

    expect(paper).toMatchObject({
      order: {
        status: "scheduled",
        scheduledDate: "2026-10-26",
        dueState: "upcoming",
        notes: "Before 7 am",
      },
      customer: { id: world.customer.id, status: "active" },
      route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
      placedByName: world.salesman.name,
      lines: [{ varietyId: world.milk.id, quantity: 2, routePricePaise: 2_499 }],
      indicativeTotalPaise: preOrder.indicativeTotalPaise,
      bill: null,
      actions: { canCancel: true, canFulfil: false },
    });
    const placed = await placeBookNowBill(world);
    expect(await refusalOf(adminBillService.getPreOrderPaper(placed.orderId))).toMatchObject({
      reason: "not_a_pre_order",
    });
  });
});
