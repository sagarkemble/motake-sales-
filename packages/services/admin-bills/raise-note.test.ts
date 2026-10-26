import { db, eq } from "@repo/database";
import { billsTable, ledgerEntriesTable, notesTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import type { AdminBillOutcome, BillLockHook } from "../shared/bill-events";
import { buildCheckoutWorld, type CheckoutWorld } from "../test/builders";
import {
  BOOK_NOW_TOTAL_PAISE,
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

async function billWithLines(world: CheckoutWorld) {
  const placed = await placeBookNowBill(world);
  const items = await billItemsOf(placed.billId);
  outcomes.length = 0;
  return {
    placed,
    milkLine: items.find((item) => item.varietyId === world.milk.id)!,
    curdLine: items.find((item) => item.varietyId === world.curd.id)!,
  };
}

describe("AdminBillService.raiseNote", () => {
  it("a GST Credit Note on chosen lines carries the return date, posts the paired Ledger credit and never rewrites the Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    const [billBefore] = await db.select().from(billsTable).where(eq(billsTable.id, placed.billId));

    const result = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "One Milk returned leaking",
      returnOrDamageOn: "2026-10-24",
    });

    const [note] = await notesOf(placed.billId);
    expect(note).toMatchObject({
      kind: "gst_credit_note",
      number: "MC/26-27/000001",
      issuedOn: today,
      reason: "One Milk returned leaking",
      returnOrDamageOn: "2026-10-24",
      sellerLegalName: "Motake Test Foods Pvt Ltd",
      pdfKey: null,
    });
    // ₹24.99 taxable + 5% split = the Milk line's per-unit value.
    expect(note!.amountPaise).toBeGreaterThan(2_499);
    expect(note!.amountPaise).toBe(note!.cgstPaise + note!.sgstPaise + 2_499);
    const [noteLine] = await noteLinesOf(note!.id);
    expect(noteLine).toMatchObject({
      snapshotLineId: milkLine.id,
      billVersionId: (await versionsOf(placed.billId))[0]!.id,
      quantity: 1,
      amountPaise: 2_499,
    });
    // Note ↔ Ledger pair.
    const [ledgerRow] = await db
      .select()
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.noteId, note!.id));
    expect(ledgerRow).toMatchObject({
      id: note!.ledgerEntryId,
      entryType: "credit_note",
      side: "credit",
      amountPaise: note!.amountPaise,
      reason: "One Milk returned leaking",
    });
    expect(result).toEqual({
      noteId: note!.id,
      number: "MC/26-27/000001",
      kind: "gst_credit_note",
      amountPaise: note!.amountPaise,
      billId: placed.billId,
      balancePaise: BOOK_NOW_TOTAL_PAISE - note!.amountPaise,
    });
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(
      BOOK_NOW_TOTAL_PAISE - note!.amountPaise,
    );
    // The Bill, its lines and history are untouched; no stock moves.
    const [billAfter] = await db.select().from(billsTable).where(eq(billsTable.id, placed.billId));
    expect(billAfter).toEqual(billBefore);
    expect(await versionsOf(placed.billId)).toHaveLength(1);
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 3,
      [world.curd.id]: 1,
    });
    expect(outcomes).toEqual([
      {
        kind: "note_raised",
        customerId: world.customer.id,
        reason: "One Milk returned leaking",
        balanceAfterPaise: BOOK_NOW_TOTAL_PAISE - note!.amountPaise,
        billId: placed.billId,
        billNumber: placed.billNumber,
        note: {
          noteId: note!.id,
          number: "MC/26-27/000001",
          kind: "gst_credit_note",
          amountPaise: note!.amountPaise,
        },
        differencePaise: -note!.amountPaise,
      },
    ]);
  });

  it("a Commercial Credit Note has no tax and a Debit Note raises the Balance; MD is its own series", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine, curdLine } = await billWithLines(world);

    const commercial = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "commercial_credit_note",
      lines: [{ lineId: curdLine.id, quantity: 1 }],
      reason: "Goodwill discount",
    });
    const debit = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "debit_note",
      lines: [{ lineId: milkLine.id, quantity: 2 }],
      reason: "Two Milk short-billed",
    });

    const notes = await notesOf(placed.billId);
    const commercialNote = notes.find((note) => note.id === commercial.noteId)!;
    expect(commercialNote).toMatchObject({
      number: "MC/26-27/000001",
      amountPaise: 4_000,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    });
    expect(debit).toMatchObject({ kind: "debit_note", number: "MD/26-27/000001" });
    expect(debit.balancePaise).toBe(BOOK_NOW_TOTAL_PAISE - 4_000 + debit.amountPaise);
    expect(outcomes.at(-1)).toMatchObject({ differencePaise: debit.amountPaise });
    expect(await billNetLedgerPaise(placed.billId)).toBe(
      BOOK_NOW_TOTAL_PAISE - 4_000 + debit.amountPaise,
    );
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(debit.balancePaise);
    expect((await ledgerRowsOf(world.customer.id)).map((row) => row.entryType)).toEqual([
      "bill",
      "credit_note",
      "debit_note",
    ]);
  });

  it("crediting all that remains on a line uses its exact remaining paise", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    const first = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "One Milk returned",
    });
    const rest = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [{ lineId: milkLine.id, quantity: 2 }],
      reason: "The other two returned",
    });

    expect(first.amountPaise + rest.amountPaise).toBe(
      milkLine.taxablePaise + milkLine.cgstPaise + milkLine.sgstPaise,
    );
    expect(
      await refusalOf(
        adminBillService.raiseNote(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 1,
          kind: "commercial_credit_note",
          lines: [{ lineId: milkLine.id, quantity: 1 }],
          reason: "Again",
        }),
      ),
    ).toMatchObject({ reason: "credit_qty_above_remaining" });
  });

  it("is allowed while the lock hook closes Correct and Cancel (the hook is not asked)", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    const asked: string[] = [];
    const lockHook: BillLockHook = async ({ action }) => {
      asked.push(action);
      return { allowed: false, reason: "month_filed", message: "Filed." };
    };

    await new AdminBillService(undefined, lockHook).raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "debit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "Short-billed",
    });

    expect(asked).toEqual([]);
    expect(await notesOf(placed.billId)).toHaveLength(1);
  });

  it("previews the Note and warns when the Bill already has Notes, writing nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);

    const preview = await adminBillService.previewRaiseNote({
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "debit_note",
      lines: [{ lineId: milkLine.id, quantity: 2 }],
    });

    expect(preview.billHasNotes).toBe(false);
    expect(preview.note).toMatchObject({
      kind: "debit_note",
      lines: [{ lineId: milkLine.id, quantity: 2, amountPaise: 4_998 }],
    });
    expect(await notesOf(placed.billId)).toEqual([]);
  });

  describe("refuses, writing nothing and sending nothing", () => {
    const pick = (lineId: string, quantity = 1) => [{ lineId, quantity }];

    it("a GST Credit Note after the deadline, naming it", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      vi.setSystemTime(new Date("2027-12-01T06:00:00Z"));

      expect(
        await refusalOf(
          adminBillService.raiseNote(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            kind: "gst_credit_note",
            lines: pick(milkLine.id),
            reason: "Late return",
          }),
        ),
      ).toEqual({
        reason: "gst_credit_note_deadline_passed",
        details: { deadlineDate: "2027-11-30" },
      });
      // A Commercial Credit Note is still allowed.
      await adminBillService.raiseNote(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        kind: "commercial_credit_note",
        lines: pick(milkLine.id),
        reason: "Late return",
      });
      expect(await notesOf(placed.billId)).toHaveLength(1);
    });

    it.each([
      [
        "a return date on a Debit Note",
        { kind: "debit_note", returnOrDamageOn: today },
        "return_date_on_debit_note",
      ],
      [
        "more credit qty than is left",
        { kind: "gst_credit_note", qty: 4 },
        "credit_qty_above_remaining",
      ],
      ["a stale version", { kind: "debit_note", expectedVersionNumber: 2 }, "stale_version"],
      ["a line not on the Bill", { kind: "debit_note", unknownLine: true }, "unknown_line"],
    ] as const)("%s", async (_label, change, reason) => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      const options = change as {
        kind: "debit_note" | "gst_credit_note";
        qty?: number;
        expectedVersionNumber?: number;
        returnOrDamageOn?: string;
        unknownLine?: boolean;
      };

      expect(
        await refusalOf(
          adminBillService.raiseNote(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: options.expectedVersionNumber ?? 1,
            kind: options.kind,
            lines: pick(
              options.unknownLine ? "00000000-0000-4000-8000-000000000000" : milkLine.id,
              options.qty,
            ),
            reason: "Note",
            returnOrDamageOn: options.returnOrDamageOn,
          }),
        ),
      ).toMatchObject({ reason });
      expect(await db.select().from(notesTable)).toEqual([]);
      expect(outcomes).toEqual([]);
    });

    it("no lines", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed } = await billWithLines(world);

      expect(
        await refusalOf(
          adminBillService.raiseNote(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            kind: "debit_note",
            lines: [],
            reason: "Note",
          }),
        ),
      ).toMatchObject({ reason: "no_lines" });
    });

    it("a cancelled Bill and a deactivated Customer's Bill", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const { placed, milkLine } = await billWithLines(world);
      const other = await placeBookNowBill(world);
      const otherMilk = (await billItemsOf(other.billId)).find(
        (item) => item.varietyId === world.milk.id,
      )!;
      await adminBillService.cancelBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      });
      outcomes.length = 0;

      expect(
        await refusalOf(
          adminBillService.raiseNote(world.admin.id, {
            billId: placed.billId,
            expectedVersionNumber: 1,
            kind: "debit_note",
            lines: pick(milkLine.id),
            reason: "Note",
          }),
        ),
      ).toMatchObject({ reason: "bill_cancelled" });

      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
      expect(
        await refusalOf(
          adminBillService.raiseNote(world.admin.id, {
            billId: other.billId,
            expectedVersionNumber: 1,
            kind: "debit_note",
            lines: pick(otherMilk.id),
            reason: "Note",
          }),
        ),
      ).toMatchObject({ reason: "customer_inactive" });
      expect(await notesOf(other.billId)).toEqual([]);
      expect(outcomes).toEqual([]);
    });
  });
});

describe("AdminBillService.raiseNote (review fixes)", () => {
  it("previews refuse a cancelled Bill and a deactivated Customer's Bill, as the write does", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);
    const other = await placeBookNowBill(world);
    const otherMilk = (await billItemsOf(other.billId)).find(
      (item) => item.varietyId === world.milk.id,
    )!;
    await adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    expect(
      await refusalOf(
        adminBillService.previewRaiseNote({
          billId: placed.billId,
          expectedVersionNumber: 1,
          kind: "debit_note",
          lines: [{ lineId: milkLine.id, quantity: 1 }],
        }),
      ),
    ).toMatchObject({ reason: "bill_cancelled" });

    await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);
    expect(
      await refusalOf(
        adminBillService.previewRaiseNote({
          billId: other.billId,
          expectedVersionNumber: 1,
          kind: "debit_note",
          lines: [{ lineId: otherMilk.id, quantity: 1 }],
        }),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
  });

  it("refuses a Debit Note qty past int4 as bad_qty, writing nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await billWithLines(world);

    expect(
      await refusalOf(
        adminBillService.raiseNote(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 1,
          kind: "debit_note",
          lines: [{ lineId: milkLine.id, quantity: 2_147_483_647 }],
          reason: "Huge",
        }),
      ),
    ).toEqual({
      reason: "bad_lines",
      details: { lines: [{ lineId: milkLine.id, reason: "bad_qty" }] },
    });
    expect(await notesOf(placed.billId)).toEqual([]);
    expect(outcomes).toEqual([]);
  });

  it("a Credit Note crediting everything left is capped at the Bill's net, so the Bill nets to zero", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine, curdLine } = await billWithLines(world);

    const note = await adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [
        { lineId: milkLine.id, quantity: 3 },
        { lineId: curdLine.id, quantity: 1 },
      ],
      reason: "Everything returned",
    });

    // Lines sum to ₹118.71; the Bill's ₹119.00 includes the round-off, which the header credits.
    expect(note.amountPaise).toBe(BOOK_NOW_TOTAL_PAISE);
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
  });

  it("two Notes raised at once on one Bill get unique, consecutive numbers", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine, curdLine } = await billWithLines(world);
    const raise = (lineId: string) =>
      adminBillService.raiseNote(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        kind: "gst_credit_note",
        lines: [{ lineId, quantity: 1 }],
        reason: "Returned",
      });

    const notes = await Promise.all([raise(milkLine.id), raise(curdLine.id)]);

    expect(notes.map((note) => note.number).sort()).toEqual(["MC/26-27/000001", "MC/26-27/000002"]);
    expect(await notesOf(placed.billId)).toHaveLength(2);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(
      BOOK_NOW_TOTAL_PAISE - notes[0]!.amountPaise - notes[1]!.amountPaise,
    );
  });
});
