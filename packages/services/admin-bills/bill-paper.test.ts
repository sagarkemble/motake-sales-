import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { customersTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentService from "../documents";
import OrderService from "../orders";
import type { BillLockHook } from "../shared/bill-events";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import {
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
  it("shows the latest version with credited and remaining qty per line, the Notes and actions", async () => {
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
    expect(paper.lock).toEqual({ correct: { allowed: true }, cancel: { allowed: true } });
    expect(paper.actions).toEqual({ canCorrect: true, canCancel: true, canRaiseNote: true });
    expect(paper.balance!.balancePaise).toBeGreaterThan(0);
  });

  it("has no Bill history: the paper is the latest version and takes no version number", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed } = await correctedBill(world);

    const paper = await adminBillService.getBillPaper({
      billId: placed.billId,
      versionNumber: 1,
    } as never);

    expect(paper.version.versionNumber).toBe(2);
    expect(paper).not.toHaveProperty("versions");
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
        ? {
            allowed: false,
            reason: "month_filed",
            message: "The month is filed. Raise Note instead.",
          }
        : { allowed: true };

    const paper = await new AdminBillService(undefined, lockHook).getBillPaper({
      billId: placed.billId,
    });

    expect(paper.lock!.correct).toEqual({
      allowed: false,
      reason: "month_filed",
      message: "The month is filed. Raise Note instead.",
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

describe("AdminBillService.getNotePaper", () => {
  it("shows the Note with its lines named from the Bill, the Bill and the Balance", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await correctedBill(world);
    const [credit] = await notesOf(placed.billId);

    const paper = await adminBillService.getNotePaper({ noteId: credit!.id });

    expect(paper.note).toMatchObject({
      id: credit!.id,
      kind: "gst_credit_note",
      number: "MC/26-27/000001",
      issuedOn: today,
      reason: "One Milk leaked",
      returnOrDamageOn: today,
      hasPdf: false,
    });
    expect(paper.bill).toEqual({
      id: placed.billId,
      number: placed.billNumber,
      billDate: today,
      cancelled: false,
    });
    expect(paper.customer).toEqual({
      id: world.customer.id,
      shopName: world.customer.shopName,
      status: "active",
    });
    expect(paper.lines).toHaveLength(1);
    expect(paper.lines[0]).toMatchObject({ name: "Milk 1 L", quantity: 1 });
    expect(paper.lines[0]!.amountPaise).toBe(milkLine.taxablePaise / milkLine.quantity);
    expect(paper.balance!.balancePaise).toBeGreaterThan(0);
  });

  it("refuses a Note that does not exist", async () => {
    await expect(adminBillService.getNotePaper({ noteId: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
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
      expect(link.url).toContain("ik-s=");
    }
    for (const note of await notesOf(placed.billId)) {
      const link = await documents.getDownloadLink(world.admin.id, { noteId: note.id });
      expect(link.filename).toContain(note.number.replaceAll("/", "-"));
    }
    const paper = await adminBillService.getBillPaper({ billId: placed.billId });
    expect(paper.version.hasPdf).toBe(true);
    expect(paper.notes.every((note) => note.hasPdf)).toBe(true);
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
