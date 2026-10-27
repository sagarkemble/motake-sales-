import { randomUUID } from "node:crypto";

import { db, sql } from "@repo/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminBillService from "../admin-bills";
import { noAdminBillListener, type BillLockHook } from "../shared/bill-events";
import { gstBillLockHook } from "../shared/gst-gates";
import { refusalOf, versionsOf } from "../test/admin-bill-world";
import {
  waitForAdvisoryLockWaiter,
  wipeApplicationTables,
  waitForLockWaiter,
} from "../test/database";
import {
  billRow,
  buildEinvoicingWorld,
  buildGstHarness,
  irnFields,
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
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// A Bill write paused inside its open transaction, already past its shared month lock: `passed`
// resolves once it is there, and it goes on (and commits) only after `release`.
function pausePoint() {
  const passed = deferred();
  const released = deferred();
  return {
    passed: passed.promise,
    release: released.resolve,
    pause: async () => {
      passed.resolve();
      await released.promise;
    },
  };
}

// Spec G's Admin Bill service whose lock hook takes the real shared month lock, then pauses.
function pausingAdminBillService(pause: () => Promise<void>) {
  const hook: BillLockHook = async (input, executor) => {
    const decision = await gstBillLockHook(input, executor);
    await pause();
    return decision;
  };
  return new AdminBillService(noAdminBillListener, hook);
}

// Files October while a Bill write holds the shared month lock: the filing must wait for it. The
// write commits first, then the filing. Returns the settle order.
async function fileWhilePaused(
  actorId: string,
  point: ReturnType<typeof pausePoint>,
  write: Promise<unknown>,
) {
  const order: string[] = [];
  const written = write.then(() => order.push("bill change"));
  await point.passed;

  const filing = fileOctober(actorId).then(() => order.push("filing"));
  try {
    await waitForAdvisoryLockWaiter();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(order).toEqual([]);
  } finally {
    // Never leave the write's transaction open, even when the filing did not wait.
    point.release();
    await Promise.allSettled([written, filing]);
  }
  await Promise.all([written, filing]);
  return order;
}

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

  it("a filing waits for a Correct already past its month lock and commits after the new version", async () => {
    const { world, placed } = await octoberBill();
    const [line] = (await versionsOf(placed.billId))[0]!.items as Array<{ id: string }>;
    const point = pausePoint();
    const correct = pausingAdminBillService(point.pause).correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: line!.id, quantity: 2 }],
      reason: "Wrong qty",
    });

    const order = await fileWhilePaused(world.admin.id, point, correct);

    expect(order).toEqual(["bill change", "filing"]);
    expect(await versionsOf(placed.billId)).toHaveLength(2);
    expect(await harness.gstService.isMonthFiled("2026-10-25")).toBe(true);
    expect(
      await refusalOf(
        harness.adminBillService.correctBill(world.admin.id, {
          billId: placed.billId,
          expectedVersionNumber: 2,
          lines: [{ lineId: line!.id, quantity: 1 }],
          reason: "Wrong qty again",
        }),
      ),
    ).toEqual({ reason: "bill_locked", details: { lockReason: "month_filed" } });
  });

  it("a filing waits for a Cancel already past its month lock and commits after the cancel", async () => {
    const { world, placed } = await octoberBill();
    const point = pausePoint();
    const cancel = pausingAdminBillService(point.pause).cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    const order = await fileWhilePaused(world.admin.id, point, cancel);

    expect(order).toEqual(["bill change", "filing"]);
    expect(await harness.gstService.getBillGstState({ billId: placed.billId })).toMatchObject({
      cancelled: true,
      filedMonth: true,
    });
  });

  it("a filing waits for a portal cancellation already past its month lock", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);
    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });
    setBusinessDay("2026-11-03");
    const point = pausePoint();
    // The ack and audit are written under the shared month lock; pause before Spec G's Cancel core.
    const cancelCore = AdminBillService.prototype.cancelBillInTransaction;
    vi.spyOn(AdminBillService.prototype, "cancelBillInTransaction").mockImplementation(
      async function (this: AdminBillService, ...args) {
        await point.pause();
        return cancelCore.apply(this, args);
      },
    );
    const portal = harness.gstService.recordPortalCancellation(world.admin.id, {
      billId: placed.billId,
      ackNumber: "CNL-0001",
      ackDate: "2026-10-25",
      reason: "Cancelled on the portal",
    });

    const order = await fileWhilePaused(world.admin.id, point, portal);

    expect(order).toEqual(["bill change", "filing"]);
    expect((await billRow(placed.billId)).portalCancelAckNumber).toBe("CNL-0001");
    expect(await harness.gstService.getBillGstState({ billId: placed.billId })).toMatchObject({
      cancelled: true,
      filedMonth: true,
      irnStatus: "portal_cancelled",
    });
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
