import { randomUUID } from "node:crypto";

import { db } from "@repo/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminBillService from "../admin-bills";
import LedgerService from "../ledger";
import OrderService from "../orders";
import { buildCheckoutWorld, buildCustomer, buildRefund } from "../test/builders";
import {
  BOOK_NOW_TOTAL_PAISE,
  billItemsOf,
  expectBalanceMatchesLedger,
  placeBookNowBill,
} from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import CustomerLedgerService from "./index";

const customerLedgerService = new CustomerLedgerService();
const adminBillService = new AdminBillService();
const ledgerService = new LedgerService();

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// Opening ₹500 Advance (23 Oct), a Book Now with ₹50 kept, a GST Credit Note, a Debit Note on a
// second (office) Bill that is then cancelled, and a Refund.
async function busyLedger() {
  const world = await buildCheckoutWorld({ businessDate: "2026-10-25" });
  const first = await placeBookNowBill(world, { receivedPaise: 5_000 });
  const firstMilk = (await billItemsOf(first.billId)).find(
    (item) => item.varietyId === world.milk.id,
  )!;
  // The frozen clock would give every posting the same time.
  vi.setSystemTime(new Date("2026-10-25T07:00:00Z"));
  const credit = await adminBillService.raiseNote(world.admin.id, {
    billId: first.billId,
    expectedVersionNumber: 1,
    kind: "gst_credit_note",
    lines: [{ lineId: firstMilk.id, quantity: 1 }],
    reason: "One Milk leaked",
  });
  // Added after go-live sales, dated back: it still sorts first.
  await customerLedgerService.addOpeningBalance(world.admin.id, {
    customerId: world.customer.id,
    side: "advance",
    amountPaise: 50_000,
    reason: "Carried over from the old book",
    openingDate: "2026-10-23",
  });
  vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));
  // The GatePass was for the 25th, so the second Bill is an office Bill.
  const second = await adminBillService.raiseBill(world.admin.id, {
    customerId: world.customer.id,
    lines: [
      { varietyId: world.milk.id, quantity: 3 },
      { varietyId: world.curd.id, quantity: 1 },
    ],
    reason: "Office sale",
  });
  vi.setSystemTime(new Date("2026-10-26T07:00:00Z"));
  await adminBillService.cancelBill(world.admin.id, {
    billId: second.billId,
    expectedVersionNumber: 1,
    reason: "Wrong shop",
  });
  vi.setSystemTime(new Date("2026-10-26T08:00:00Z"));
  const refund = await buildRefund({
    customer: world.customer,
    actorId: world.admin.id,
    amountPaise: 1_000,
  });
  await db.transaction((transaction) =>
    ledgerService.post(
      {
        entryType: "refund",
        refundId: refund.id,
        customerId: world.customer.id,
        actorId: world.admin.id,
      },
      transaction,
    ),
  );
  return { world, first, second, credit, refund };
}

describe("CustomerLedgerService.listRows", () => {
  it("lists every row, Opening balance first, with type, number, Debit/Credit and what it opens", async () => {
    const { world, first, second, credit, refund } = await busyLedger();

    const page = await customerLedgerService.listRows({ customerId: world.customer.id });

    expect(page.totalCount).toBe(7);
    expect(
      page.items.map((row) => [row.rowType, row.date, row.number, row.debitPaise, row.creditPaise]),
    ).toEqual([
      ["opening_balance", "2026-10-23", null, null, 50_000],
      ["bill", "2026-10-25", first.billNumber, BOOK_NOW_TOTAL_PAISE, null],
      ["payment", "2026-10-25", expect.stringMatching(/^MP\//), null, 5_000],
      ["gst_credit_note", "2026-10-25", credit.number, null, credit.amountPaise],
      ["bill", "2026-10-26", second.billNumber, BOOK_NOW_TOTAL_PAISE, null],
      ["gst_credit_note", "2026-10-26", "MC/26-27/000002", null, BOOK_NOW_TOTAL_PAISE],
      ["refund", "2026-10-26", refund.number, 1_000, null],
    ]);
    const openingRow = page.items[0]!;
    expect(openingRow).toMatchObject({
      detailsTitle: "Opening balance",
      reason: "Carried over from the old book",
      cancelled: false,
      open: { kind: "opening_balance", entryId: openingRow.id },
    });
    const bills = page.items.filter((row) => row.rowType === "bill");
    expect(bills.map((row) => row.cancelled)).toEqual([false, true]);
    expect(bills[0]!.open).toEqual({ kind: "bill", billId: first.billId });
    const noteRow = page.items.find((row) => row.number === credit.number)!;
    expect(noteRow).toMatchObject({
      typeLabel: "GST Credit Note",
      open: { kind: "note", billId: first.billId, noteId: credit.noteId },
    });
    expect(page.items.find((row) => row.rowType === "refund")!.open).toEqual({
      kind: "refund",
      refundId: refund.id,
    });
  });

  it("filters by type, side and date range and pages, without touching the footer", async () => {
    const { world } = await busyLedger();
    const customerId = world.customer.id;

    const notes = await customerLedgerService.listRows({
      customerId,
      types: ["gst_credit_note", "commercial_credit_note", "debit_note"],
    });
    expect(notes.items.map((row) => row.rowType)).toEqual(["gst_credit_note", "gst_credit_note"]);

    const credits = await customerLedgerService.listRows({ customerId, side: "credit" });
    expect(credits.items.every((row) => row.creditPaise !== null)).toBe(true);

    const onTheDay = await customerLedgerService.listRows({
      customerId,
      from: "2026-10-26",
      to: "2026-10-26",
    });
    expect(onTheDay.items.map((row) => row.date)).toEqual(onTheDay.items.map(() => "2026-10-26"));

    const pageTwo = await customerLedgerService.listRows({ customerId, page: 2, pageSize: 3 });
    expect(pageTwo).toMatchObject({
      page: 2,
      pageSize: 3,
      totalPages: Math.ceil(pageTwo.totalCount / 3),
    });
    expect(pageTwo.items).toHaveLength(3);

    const summary = await customerLedgerService.getSummary(customerId);
    expect(summary.footer.opening).toEqual({ debitPaise: 0, creditPaise: 50_000 });
  });
});

describe("CustomerLedgerService.getSummary", () => {
  it("footer: Opening, Current total and Closing, which equals the stored Balance", async () => {
    const { world, credit } = await busyLedger();

    const summary = await customerLedgerService.getSummary(world.customer.id);

    const currentDebit = BOOK_NOW_TOTAL_PAISE * 2 + 1_000;
    const currentCredit = 5_000 + credit.amountPaise + BOOK_NOW_TOTAL_PAISE;
    const closing = -50_000 + currentDebit - currentCredit;
    expect(summary).toEqual({
      customer: {
        id: world.customer.id,
        shopName: world.customer.shopName,
        phone: world.customer.phone,
        status: "active",
        routeName: world.route.name,
        routeCode: world.route.code,
      },
      footer: {
        opening: { debitPaise: 0, creditPaise: 50_000 },
        currentTotal: { debitPaise: currentDebit, creditPaise: currentCredit },
        closing: { balancePaise: closing, state: "advance", amountPaise: -closing },
      },
      hasOpeningBalance: true,
    });
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(closing);
  });

  it("an empty Ledger is Settled with no Opening balance", async () => {
    const world = await buildCheckoutWorld({ businessDate: "2026-10-25" });

    const summary = await customerLedgerService.getSummary(world.customer.id);

    expect(summary.footer).toEqual({
      opening: { debitPaise: 0, creditPaise: 0 },
      currentTotal: { debitPaise: 0, creditPaise: 0 },
      closing: { balancePaise: 0, state: "settled", amountPaise: 0 },
    });
    expect(summary.hasOpeningBalance).toBe(false);
    expect((await customerLedgerService.listRows({ customerId: world.customer.id })).items).toEqual(
      [],
    );
  });
});

describe("CustomerLedgerService.listOpenPreorders", () => {
  it("lists only this Customer's unfulfilled Pre-orders, earliest first, with due state", async () => {
    const world = await buildCheckoutWorld({ businessDate: "2026-10-25" });
    const orderService = new OrderService();
    const place = (scheduledDate: string) =>
      orderService.placePreOrder(world.salesman.id, {
        customerId: world.customer.id,
        scheduledDate,
        idempotencyKey: randomUUID(),
        lines: [{ sku: world.milk.sku, qty: 2 }],
      });
    const later = await place("2026-10-28");
    const sooner = await place("2026-10-26");
    const cancelled = await place("2026-10-27");
    await adminBillService.cancelPreOrder(world.admin.id, {
      orderId: cancelled.orderId,
      reason: "Shop asked",
    });
    const otherCustomer = await buildCustomer(world.admin.id, { routeId: world.route.id });
    await orderService.placePreOrder(world.salesman.id, {
      customerId: otherCustomer.id,
      scheduledDate: "2026-10-26",
      idempotencyKey: randomUUID(),
      lines: [{ sku: world.milk.sku, qty: 1 }],
    });
    vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));

    const open = await customerLedgerService.listOpenPreorders(world.customer.id);

    expect(open.map((row) => [row.id, row.scheduledDate, row.dueState])).toEqual([
      [sooner.orderId, "2026-10-26", "due"],
      [later.orderId, "2026-10-28", "upcoming"],
    ]);
  });
});
