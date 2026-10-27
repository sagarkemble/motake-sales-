import { randomUUID } from "node:crypto";

import { db, sql } from "@repo/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refusalOf, versionsOf } from "../test/admin-bill-world";
import { wipeApplicationTables, waitForLockWaiter } from "../test/database";
import {
  buildEinvoicingWorld,
  buildGstHarness,
  placeBill,
  setBusinessDay,
  type GstHarness,
} from "../test/gst-world";

let harness: GstHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  setBusinessDay("2026-10-25");
  harness = buildGstHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

async function fileOctober(actorId: string) {
  return harness.gstService.recordGstr1Filing(actorId, {
    month: "2026-10",
    filedOn: "2026-11-03",
    reference: "OCT-ACK",
  });
}

// An October Bill of a Customer without e-invoicing, then the clock moves to 3 Nov.
async function octoberBill() {
  const world = await buildEinvoicingWorld({ businessDate: "2026-10-25", einvoicing: false });
  const placed = await placeBill(world);
  setBusinessDay("2026-11-03");
  return { world, placed };
}

describe("Filed month lock on Spec G's Correct and Cancel", () => {
  it("refuses line Correct, text-only Correct and Cancel in a filed month, naming Raise Note; Raise Note still works", async () => {
    const { world, placed } = await octoberBill();
    await fileOctober(world.admin.id);
    const [line] = (await versionsOf(placed.billId))[0]!.items as Array<{ id: string }>;

    const lineCorrect = await refusalOf(
      harness.adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: line!.id, quantity: 2 }],
        reason: "Wrong qty",
      }),
    );
    const textCorrect = await refusalOf(
      harness.adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        buyer: { shopName: "New name", phone: "9800000001", address: "Elsewhere" },
        reason: "Wrong buyer text",
      }),
    );
    const cancel = await refusalOf(
      harness.adminBillService.cancelBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      }),
    );
    const note = await harness.adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [{ lineId: line!.id, quantity: 1 }],
      reason: "One pack damaged",
      idempotencyKey: randomUUID(),
    });

    for (const refusal of [lineCorrect, textCorrect, cancel]) {
      expect(refusal).toEqual({ reason: "bill_locked", details: { lockReason: "month_filed" } });
    }
    expect(note.kind).toBe("gst_credit_note");
    expect(await versionsOf(placed.billId)).toHaveLength(1);
    const state = await harness.gstService.getBillGstState({ billId: placed.billId });
    expect(state).toMatchObject({
      filedMonth: true,
      allowed: { lineCorrect: false, cancel: false, portalCancel: false, raiseNote: true },
    });
    expect(state.refusalReasons.lineCorrect).toContain("Raise Note instead");
  });

  it("shows the lock on the Bill paper: Correct and Cancel off with the reason, Raise Note on", async () => {
    const { world, placed } = await octoberBill();
    await fileOctober(world.admin.id);

    const paper = await harness.adminBillService.getBillPaper({ billId: placed.billId });

    expect(paper.actions).toEqual({ canCorrect: false, canCancel: false, canRaiseNote: true });
    expect(paper.lock?.correct).toMatchObject({ allowed: false, reason: "month_filed" });
  });

  it("does not lock a Bill dated the day before the month starts", async () => {
    setBusinessDay("2026-09-30");
    const world = await buildEinvoicingWorld({ businessDate: "2026-09-30", einvoicing: false });
    const placed = await placeBill(world);
    setBusinessDay("2026-11-03");
    await fileOctober(world.admin.id);

    const result = await harness.adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    expect(result.billId).toBe(placed.billId);
    expect(await harness.gstService.isMonthFiled("2026-09-30")).toBe(false);
    expect(await harness.gstService.isMonthFiled("2026-10-01")).toBe(true);
  });

  it("locks an Admin Raise Bill the same way", async () => {
    const world = await buildEinvoicingWorld({ businessDate: "2026-10-25", einvoicing: false });
    const raised = await harness.adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: [{ varietyId: world.milk.id, quantity: 2 }],
      reason: "Office sale",
    });
    setBusinessDay("2026-11-03");
    await fileOctober(world.admin.id);

    const refusal = await refusalOf(
      harness.adminBillService.cancelBill(world.admin.id, {
        billId: raised.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      }),
    );

    expect(refusal).toEqual({ reason: "bill_locked", details: { lockReason: "month_filed" } });
  });

  it("Correct filing never unlocks the month", async () => {
    const { world, placed } = await octoberBill();
    const { filing } = await fileOctober(world.admin.id);
    await harness.gstService.correctGstr1Filing(world.admin.id, {
      filingId: filing.id,
      filedOn: "2026-11-02",
      reference: "OCT-ACK-2",
      reason: "Typo",
    });

    const refusal = await refusalOf(
      harness.adminBillService.cancelBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      }),
    );

    expect(refusal.details).toEqual({ lockReason: "month_filed" });
  });

  it("a Correct racing a filing for its month never writes a version after the filing commits", async () => {
    const { world, placed } = await octoberBill();
    const [line] = (await versionsOf(placed.billId))[0]!.items as Array<{ id: string }>;

    // Another writer holds the Bill row, so the Correct queues before its gate check.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const rowLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT id FROM bills WHERE id = ${placed.billId} FOR UPDATE`);
      locked();
      await held;
    });
    await rowLocked;
    const correct = refusalOf(
      harness.adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: line!.id, quantity: 2 }],
        reason: "Wrong qty",
      }),
    );
    await waitForLockWaiter();

    await fileOctober(world.admin.id);
    release();
    await holder;

    expect(await correct).toEqual({
      reason: "bill_locked",
      details: { lockReason: "month_filed" },
    });
    expect(await versionsOf(placed.billId)).toHaveLength(1);
  });

  it("a Correct that commits before the filing stands, and the month is locked after", async () => {
    const { world, placed } = await octoberBill();
    const [line] = (await versionsOf(placed.billId))[0]!.items as Array<{ id: string }>;

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: line!.id, quantity: 2 }],
      reason: "Wrong qty",
    });
    await fileOctober(world.admin.id);

    expect(await versionsOf(placed.billId)).toHaveLength(2);
    expect(
      (await harness.gstService.getBillGstState({ billId: placed.billId })).allowed.lineCorrect,
    ).toBe(false);
  });
});
