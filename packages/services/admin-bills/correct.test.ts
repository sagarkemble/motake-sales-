import { randomUUID } from "node:crypto";

import { db } from "@repo/database";
import { auditLogsTable, billsTable, sellerSettingsTable } from "@repo/database/schema";
import { eq } from "@repo/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import type { AdminBillOutcome, BillLockHook } from "../shared/bill-events";
import { buildCheckoutWorld, buildSellerSettings, type CheckoutWorld } from "../test/builders";
import {
  BOOK_NOW_TOTAL_PAISE,
  billItemsOf,
  billNetLedgerPaise,
  expectBalanceMatchesLedger,
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
const outcomes: AdminBillOutcome[] = [];
const adminBillService = new AdminBillService((outcome) => {
  outcomes.push(outcome);
});

beforeEach(async () => {
  await wipeApplicationTables();
  outcomes.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function billWithLines(world: CheckoutWorld, options = {}) {
  const placed = await placeBookNowBill(world, options);
  const items = await billItemsOf(placed.billId);
  const milkLine = items.find((item) => item.varietyId === world.milk.id)!;
  const curdLine = items.find((item) => item.varietyId === world.curd.id);
  return { placed, milkLine, curdLine };
}

async function billTotal(billId: string) {
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  return bill!;
}

describe("AdminBillService.correctBill", () => {
  it("raising a qty rewrites the live Bill in place, appends v2 and writes one Debit Note for the exact rise", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine, curdLine } = await billWithLines(world);
    const soldBefore = await soldQtyByVariety(world.gatepass.id);
    outcomes.length = 0;

    const result = await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "Shop took one more Milk",
    });

    const bill = await billTotal(placed.billId);
    expect(result.classification).toBe("debit_note");
    expect(result.versionNumber).toBe(2);
    expect(result.totalPaise).toBe(bill.totalPaise);
    expect(bill.totalPaise).toBeGreaterThan(BOOK_NOW_TOTAL_PAISE);
    expect(bill.number).toBe(placed.billNumber);
    // Same line ids, new qty.
    const items = await billItemsOf(placed.billId);
    expect(items.map((item) => item.id).sort()).toEqual([milkLine.id, curdLine!.id].sort());
    expect(items.find((item) => item.id === milkLine.id)!.quantity).toBe(4);

    const versions = await versionsOf(placed.billId);
    expect(versions.map((version) => [version.versionNumber, version.reason])).toEqual([
      [1, "Raised"],
      [2, "Shop took one more Milk"],
    ]);
    expect(versions[1]!.pdfKey).toBeNull();

    const [debitNote] = await notesOf(placed.billId);
    expect(debitNote).toMatchObject({
      kind: "debit_note",
      number: "MD/26-27/000001",
      issuedOn: today,
      reason: "Shop took one more Milk",
      amountPaise: bill.totalPaise - BOOK_NOW_TOTAL_PAISE,
      returnOrDamageOn: null,
      pdfKey: null,
    });
    const [noteLine] = await noteLinesOf(debitNote!.id);
    expect(noteLine).toMatchObject({
      billVersionId: versions[0]!.id,
      snapshotLineId: milkLine.id,
      quantity: 1,
    });
    // Ledger: Bill debit (as issued) + Debit Note = the new total.
    expect(await billNetLedgerPaise(placed.billId)).toBe(bill.totalPaise);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(bill.totalPaise);
    expect(result.balancePaise).toBe(bill.totalPaise);
    // No stock goes back or out; no audit row.
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual(soldBefore);
    expect(await db.select().from(auditLogsTable)).toEqual([]);
    expect(outcomes).toEqual([
      expect.objectContaining({
        kind: "bill_corrected",
        customerId: world.customer.id,
        billId: placed.billId,
        versionNumber: 2,
        balanceChanged: true,
        netDifferencePaise: bill.totalPaise - BOOK_NOW_TOTAL_PAISE,
        balanceAfterPaise: bill.totalPaise,
        notes: [
          {
            noteId: debitNote!.id,
            number: "MD/26-27/000001",
            kind: "debit_note",
            amountPaise: debitNote!.amountPaise,
          },
        ],
      }),
    ]);
  });

  it("lowering and removing lines writes one GST Credit Note before the deadline and drops removed lines", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine, curdLine } = await billWithLines(world);

    const result = await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [
        { lineId: milkLine.id, quantity: 2 },
        { lineId: curdLine!.id, quantity: 0 },
      ],
      reason: "Curd was never delivered",
    });

    const bill = await billTotal(placed.billId);
    expect(result.classification).toBe("credit_note");
    const items = await billItemsOf(placed.billId);
    expect(items.map((item) => [item.id, item.quantity])).toEqual([[milkLine.id, 2]]);
    const [creditNote] = await notesOf(placed.billId);
    expect(creditNote).toMatchObject({
      kind: "gst_credit_note",
      number: "MC/26-27/000001",
      amountPaise: BOOK_NOW_TOTAL_PAISE - bill.totalPaise,
    });
    expect(
      (await noteLinesOf(creditNote!.id)).map((line) => [line.snapshotLineId, line.quantity]),
    ).toEqual(
      expect.arrayContaining([
        [milkLine.id, 1],
        [curdLine!.id, 1],
      ]),
    );
    // v2 keeps only the surviving line; v1 still shows both.
    const versions = await versionsOf(placed.billId);
    expect((versions[0]!.items as unknown[]).length).toBe(2);
    expect((versions[1]!.items as unknown[]).length).toBe(1);
    expect(await billNetLedgerPaise(placed.billId)).toBe(bill.totalPaise);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(bill.totalPaise);
  });

  it("a rise and a fall together write both Notes (MC before MD), netting to the change in total", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine, curdLine } = await billWithLines(world);

    const result = await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [
        { lineId: milkLine.id, quantity: 1 },
        { lineId: curdLine!.id, quantity: 3 },
      ],
      reason: "Lines swapped at entry",
    });

    const bill = await billTotal(placed.billId);
    expect(result.classification).toBe("debit_and_credit_notes");
    const notes = await notesOf(placed.billId);
    const credit = notes.find((note) => note.kind === "gst_credit_note")!;
    const debit = notes.find((note) => note.kind === "debit_note")!;
    expect(credit.number).toBe("MC/26-27/000001");
    expect(debit.number).toBe("MD/26-27/000001");
    expect(debit.amountPaise - credit.amountPaise).toBe(bill.totalPaise - BOOK_NOW_TOTAL_PAISE);
    expect(result.notes.map((note) => note.kind)).toEqual(["gst_credit_note", "debit_note"]);
    expect(await billNetLedgerPaise(placed.billId)).toBe(bill.totalPaise);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(bill.totalPaise);
  });

  it("writes a Commercial Credit Note once the GST Credit Note deadline has passed", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    // FY 2026-27's default deadline is 30 Nov 2027.
    vi.setSystemTime(new Date("2027-12-01T06:00:00Z"));

    const result = await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 2 }],
      reason: "One Milk returned",
    });

    expect(result.classification).toBe("credit_note");
    const [note] = await notesOf(placed.billId);
    expect(note).toMatchObject({
      kind: "commercial_credit_note",
      number: "MC/27-28/000001",
      issuedOn: "2027-12-01",
    });
    const bill = await billTotal(placed.billId);
    expect(await billNetLedgerPaise(placed.billId)).toBe(bill.totalPaise);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(bill.totalPaise);
  });

  it("keeps the buyer as issued: a qty Correct leaves the letterhead buyer unchanged", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    const issuedBuyer = ((await billTotal(placed.billId)).letterhead as { buyer: unknown }).buyer;

    await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "One more Milk",
    });

    const bill = await billTotal(placed.billId);
    expect((bill.letterhead as { buyer: unknown }).buyer).toEqual(issuedBuyer);
  });

  it("previews the classification, Notes and new totals and warns when the Bill has Notes, writing nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);

    const preview = await adminBillService.previewCorrect({
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
    });

    expect(preview.classification).toBe("debit_note");
    expect(preview.creditNote).toBeNull();
    expect(preview.debitNote!.amountPaise).toBe(preview.netDifferencePaise);
    expect(preview.totals.totalPaise - BOOK_NOW_TOTAL_PAISE).toBe(preview.netDifferencePaise);
    expect(preview.billHasNotes).toBe(false);
    expect(preview.lines).toEqual(
      expect.arrayContaining([
        { lineId: milkLine.id, previousQty: 3, quantity: 4, removed: false },
      ]),
    );
    expect(await notesOf(placed.billId)).toEqual([]);
    expect(await versionsOf(placed.billId)).toHaveLength(1);

    await adminBillService.raiseNote(world.admin.id, {
      idempotencyKey: randomUUID(),
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "debit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "Short-billed",
    });
    const warned = await adminBillService.previewCorrect({
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
    });
    expect(warned.billHasNotes).toBe(true);
  });

  describe("refuses, writing nothing and sending nothing", () => {
    async function expectNothingWritten(billId: string) {
      expect(await versionsOf(billId)).toHaveLength(1);
      expect(outcomes).toEqual([]);
    }

    it.each([
      [
        "a stale version",
        (lineId: string) => ({ expectedVersionNumber: 2, lines: [{ lineId, quantity: 4 }] }),
        "stale_version",
      ],
      [
        "no change",
        (lineId: string) => ({ expectedVersionNumber: 1, lines: [{ lineId, quantity: 3 }] }),
        "nothing_changed",
      ],
      [
        "a line not on the Bill",
        () => ({
          expectedVersionNumber: 1,
          lines: [{ lineId: "00000000-0000-4000-8000-000000000000", quantity: 1 }],
        }),
        "unknown_line",
      ],
    ] as const)("for %s", async (_label, change, reason) => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.correctBill(world.admin.id, {
            billId: placed.billId,
            reason: "Fix",
            ...change(milkLine.id),
          }),
        ),
      ).toMatchObject({ reason });
      await expectNothingWritten(placed.billId);
    });

    it("for every line at 0 (use Cancel)", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine, curdLine } = await billWithLines(world);
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.correctBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            lines: [
              { lineId: milkLine.id, quantity: 0 },
              { lineId: curdLine!.id, quantity: 0 },
            ],
            reason: "Void",
          }),
        ),
      ).toMatchObject({ reason: "all_lines_zero" });
      await expectNothingWritten(placed.billId);
    });

    it("for a qty below what a Credit Note already credited", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      await adminBillService.raiseNote(world.admin.id, {
        idempotencyKey: randomUUID(),
        billId: placed.billId,
        expectedVersionNumber: 1,
        kind: "gst_credit_note",
        lines: [{ lineId: milkLine.id, quantity: 2 }],
        reason: "Two Milk damaged",
      });
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.correctBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            lines: [{ lineId: milkLine.id, quantity: 1 }],
            reason: "Fix",
          }),
        ),
      ).toEqual({
        reason: "below_credited_qty",
        details: { lines: [{ lineId: milkLine.id, quantity: 1, floorQty: 2 }] },
      });
      await expectNothingWritten(placed.billId);
      // Down to the floor is fine.
      await adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: milkLine.id, quantity: 2 }],
        reason: "Fix",
      });
      expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(
        await billNetLedgerPaise(placed.billId),
      );
    });

    it("for a cancelled Bill", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      await adminBillService.cancelBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      });
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.correctBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            lines: [{ lineId: milkLine.id, quantity: 4 }],
            reason: "Fix",
          }),
        ),
      ).toMatchObject({ reason: "bill_cancelled" });
      await expectNothingWritten(placed.billId);
    });

    it("when the lock hook closes the Bill's month, with the hook's reason", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      const asked: string[] = [];
      const lockHook: BillLockHook = async ({ action }) => {
        asked.push(action);
        return { allowed: false, reason: "month_filed", message: "October 2026 is filed." };
      };
      const lockedService = new AdminBillService((outcome) => {
        outcomes.push(outcome);
      }, lockHook);
      outcomes.length = 0;

      expect(
        await refusalOf(
          lockedService.correctBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            lines: [{ lineId: milkLine.id, quantity: 4 }],
            reason: "Fix",
          }),
        ),
      ).toEqual({ reason: "bill_locked", details: { lockReason: "month_filed" } });
      expect(asked).toEqual(["correct"]);
      await expectNothingWritten(placed.billId);
    });

    it("for a deactivated Customer", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.correctBill(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            lines: [{ lineId: milkLine.id, quantity: 4 }],
            reason: "Fix",
          }),
        ),
      ).toMatchObject({ reason: "customer_inactive" });
      await expectNothingWritten(placed.billId);
    });
  });

  it("two Corrects from the same version: one wins, the other is refused as stale", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);

    const settled = await Promise.allSettled([
      adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: milkLine.id, quantity: 4 }],
        reason: "First",
      }),
      adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: milkLine.id, quantity: 5 }],
        reason: "Second",
      }),
    ]);

    expect(settled.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((outcome) => outcome.status === "rejected")!;
    expect(
      await refusalOf(Promise.reject((rejected as PromiseRejectedResult).reason)),
    ).toMatchObject({ reason: "stale_version" });
    expect(await versionsOf(placed.billId)).toHaveLength(2);
    expect(await notesOf(placed.billId)).toHaveLength(1);
    const bill = await billTotal(placed.billId);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(bill.totalPaise);
  });

  it("a failure after the Note is written rolls back the whole Correct, its numbers and Ledger rows", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    // The Seller master is read just before the Notes are written.
    await db.delete(sellerSettingsTable);
    outcomes.length = 0;

    expect(
      await refusalOf(
        adminBillService.correctBill(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 1,
          lines: [{ lineId: milkLine.id, quantity: 4 }],
          reason: "Fix",
        }),
      ),
    ).toMatchObject({ reason: "seller_master_missing" });
    expect(
      (await billItemsOf(placed.billId)).find((item) => item.id === milkLine.id)!.quantity,
    ).toBe(3);
    expect(await versionsOf(placed.billId)).toHaveLength(1);
    expect(await notesOf(placed.billId)).toEqual([]);
    expect(await billNetLedgerPaise(placed.billId)).toBe(BOOK_NOW_TOTAL_PAISE);
    expect(outcomes).toEqual([]);

    await buildSellerSettings(world.admin.id);
    const result = await adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "Fix",
    });
    expect(result.notes.map((note) => note.number)).toEqual(["MD/26-27/000001"]);
  });

  it("a throwing listener never fails or rolls back the Correct", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    const throwingService = new AdminBillService(() => {
      throw new Error("WhatsApp is down");
    });

    const result = await throwingService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "Fix",
    });

    expect(result.versionNumber).toBe(2);
    expect(await notesOf(placed.billId)).toHaveLength(1);
  });
});

describe("AdminBillService.correctBill (review fixes)", () => {
  it("the preview refuses a cancelled Bill, a locked Bill and a deactivated Customer, as the write does", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const cancelled = await billWithLines(world);
    await adminBillService.cancelBill(world.admin.id, {
      billId: cancelled.placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });
    const open = await billWithLines(world);
    const preview = (service: AdminBillService, billId: string, lineId: string) =>
      service.previewCorrect({
        billId,
        expectedVersionNumber: 1,
        lines: [{ lineId, quantity: 4 }],
      });

    expect(
      await refusalOf(preview(adminBillService, cancelled.placed.billId, cancelled.milkLine.id)),
    ).toMatchObject({ reason: "bill_cancelled" });
    const lockedService = new AdminBillService(undefined, async () => ({
      allowed: false,
      reason: "month_filed",
      message: "October 2026 is filed.",
    }));
    expect(await refusalOf(preview(lockedService, open.placed.billId, open.milkLine.id))).toEqual({
      reason: "bill_locked",
      details: { lockReason: "month_filed" },
    });

    await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
    expect(
      await refusalOf(preview(adminBillService, open.placed.billId, open.milkLine.id)),
    ).toMatchObject({ reason: "customer_inactive" });
  });

  it("a Correct for a deactivated Customer is refused customer_inactive", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
    outcomes.length = 0;

    expect(
      await refusalOf(
        adminBillService.correctBill(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 1,
          lines: [{ lineId: milkLine.id, quantity: 4 }],
          reason: "One more Milk",
        }),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
    expect(await versionsOf(placed.billId)).toHaveLength(1);
    expect(outcomes).toEqual([]);
  });

  it("refuses a qty past int4 as bad_qty, writing nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    outcomes.length = 0;

    expect(
      await refusalOf(
        adminBillService.correctBill(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 1,
          lines: [{ lineId: milkLine.id, quantity: 2_147_483_648 }],
          reason: "Huge",
        }),
      ),
    ).toEqual({
      reason: "bad_lines",
      details: { lines: [{ lineId: milkLine.id, reason: "bad_qty" }] },
    });
    expect(await versionsOf(placed.billId)).toHaveLength(1);
    expect(await notesOf(placed.billId)).toEqual([]);
    expect(outcomes).toEqual([]);
  });
});
