import { asc, db, eq, sql } from "@repo/database";
import { auditLogsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentService from "../documents";
import { refusalOf as refusalCarriedBy } from "../errors";
import { refusalOf, versionsOf } from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import {
  billRow,
  buildEinvoicingWorld,
  buildGstHarness,
  irnFields,
  irnOf,
  placeBill,
  rejectionOf,
  setBusinessDay,
  withCustomer,
  type GstHarness,
} from "../test/gst-world";
import GstService from "./index";

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

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function imageBase64(magic: number[], size = 64): string {
  const bytes = new Uint8Array(size);
  bytes.set(magic);
  return Buffer.from(bytes).toString("base64");
}

const png = { contentType: "image/png" as const, base64: imageBase64(PNG_MAGIC) };

async function irnAuditRows(billId: string) {
  return db
    .select()
    .from(auditLogsTable)
    .where(
      sql`${auditLogsTable.entityId} = ${billId} AND ${auditLogsTable.action} = 'irn_recorded'`,
    )
    .orderBy(asc(auditLogsTable.createdAt));
}

async function pendingBill() {
  const world = await buildEinvoicingWorld();
  const placed = await placeBill(world);
  return { world, placed };
}

describe("GstService.enterIrn", () => {
  it("records the four fields with who and when, writes the audit row and tells Spec J once", async () => {
    const { world, placed } = await pendingBill();

    const result = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1", { irn: `  ${irnOf("1")}  ` }),
    });

    const recordedAt = new Date("2026-10-25T06:00:00Z");
    expect(result).toEqual({
      billId: placed.billId,
      irn: irnOf("1"),
      ackNumber: "11231",
      ackDate: "2026-10-25",
      signedQrText: "signed-qr-1",
      hasSignedQrImage: false,
      irnRecordedAt: recordedAt,
      balanceAfterPaise: placed.balancePaise,
      irnRecordedBy: world.admin.id,
      irnCorrectReason: null,
    });
    expect(await billRow(placed.billId)).toMatchObject({
      irn: irnOf("1"),
      irnAckNumber: "11231",
      irnAckDate: "2026-10-25",
      signedQrText: "signed-qr-1",
      signedQrImageKey: null,
      irnRecordedAt: recordedAt,
      irnRecordedBy: world.admin.id,
      irnCorrectReason: null,
    });
    expect(await irnAuditRows(placed.billId)).toEqual([
      expect.objectContaining({
        actorId: world.admin.id,
        entityType: "bill",
        customerId: world.customer.id,
        reason: null,
        payload: {
          irn: irnOf("1"),
          irnAckNumber: "11231",
          irnAckDate: "2026-10-25",
          signedQrText: "signed-qr-1",
          signedQrImageKey: null,
        },
      }),
    ]);
    expect(harness.gstOutcomes).toEqual([
      {
        kind: "irn_recorded",
        billId: placed.billId,
        billNumber: placed.billNumber,
        customerId: world.customer.id,
        versionNumber: 1,
        irnRecordedAt: recordedAt,
      },
    ]);
  });

  it("stores the optional signed QR image privately under signed-qr-{irn_recorded_at ms}", async () => {
    const { world, placed } = await pendingBill();

    const result = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
      signedQrImage: png,
    });

    const key = `documents/bills/${placed.billId}/signed-qr-${result.irnRecordedAt.getTime()}.png`;
    expect(result.hasSignedQrImage).toBe(true);
    expect((await billRow(placed.billId)).signedQrImageKey).toBe(key);
    expect(harness.store.objects.get(key)?.contentType).toBe("image/png");
    expect(harness.store.puts).toEqual([key]);
  });

  it("refuses a GIF or an image over 1 MB and writes nothing", async () => {
    const { world, placed } = await pendingBill();

    await expect(
      harness.gstService.enterIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        signedQrImage: { contentType: "image/gif" as "image/png", base64: imageBase64(GIF_MAGIC) },
      }),
    ).rejects.toThrow(/PNG or JPEG/);
    const gifAsPng = await refusalOf(
      harness.gstService.enterIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        signedQrImage: { contentType: "image/png", base64: imageBase64(GIF_MAGIC) },
      }),
    );
    const tooLarge = await refusalOf(
      harness.gstService.enterIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        signedQrImage: {
          contentType: "image/png",
          base64: imageBase64(PNG_MAGIC, 1024 * 1024 + 1),
        },
      }),
    );

    expect(gifAsPng.reason).toBe("bad_image");
    expect(tooLarge.reason).toBe("bad_image");
    expect(await billRow(placed.billId)).toMatchObject({ irn: null, signedQrImageKey: null });
    expect(await irnAuditRows(placed.billId)).toEqual([]);
    expect(harness.store.objects.size).toBe(0);
    expect(harness.gstOutcomes).toEqual([]);
  });

  it("refuses each missing required field with its own message", async () => {
    const { world, placed } = await pendingBill();
    const cases = [
      [{ irn: " " }, /IRN is required/],
      [{ ackNumber: "" }, /Ack number is required/],
      [{ ackDate: "" }, /YYYY-MM-DD/],
      [{ signedQrText: "  " }, /Signed QR text is required/],
    ] as const;

    for (const [override, message] of cases) {
      await expect(
        harness.gstService.enterIrn(world.admin.id, {
          billId: placed.billId,
          ...irnFields("1", override),
        }),
      ).rejects.toThrow(message);
    }
    expect((await billRow(placed.billId)).irn).toBeNull();
  });

  it("refuses a Bill of Supply, a Customer without e-invoicing and a cancelled Bill", async () => {
    const world = await buildEinvoicingWorld();
    const billOfSupply = await placeBill(world, { curd: 1 });
    const cancelled = await placeBill(world);
    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: cancelled.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });
    const notApplicable = await placeBill(await withCustomer(world, { einvoicing: false }));

    const messages = [];
    for (const [billId, seed] of [
      [billOfSupply.billId, "1"],
      [notApplicable.billId, "2"],
      [cancelled.billId, "3"],
    ] as const) {
      const error = await rejectionOf(
        harness.gstService.enterIrn(world.admin.id, { billId, ...irnFields(seed) }),
      );
      expect(error).toMatchObject({ code: "CONFLICT" });
      messages.push(error.message);
    }

    expect(messages[0]).toContain("Bill of Supply");
    expect(messages[1]).toContain("E-invoicing is not required");
    expect(messages[2]).toContain("is cancelled");
    expect(harness.gstOutcomes).toEqual([]);
  });

  it("first writer wins: a different second entry is refused, an identical retry returns the stored result", async () => {
    const { world, placed } = await pendingBill();
    const first = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
    });
    setBusinessDay("2026-10-26");

    const retry = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
    });
    const other = await rejectionOf(
      harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("2") }),
    );

    expect(retry).toEqual(first);
    expect(other).toMatchObject({ code: "CONFLICT" });
    expect(other.message).toContain("IRN already recorded — use Correct IRN");
    expect(await irnAuditRows(placed.billId)).toHaveLength(1);
    expect(harness.gstOutcomes).toHaveLength(1);
  });

  it("two Admins at once on the same Bill: one wins, the other is told to use Correct IRN", async () => {
    const { world, placed } = await pendingBill();

    const results = await Promise.allSettled([
      harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") }),
      harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("2") }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.filter((result) => result.status === "rejected");
    expect(String((refused as PromiseRejectedResult).reason.message)).toContain("use Correct IRN");
    expect(harness.gstOutcomes).toHaveLength(1);
  });

  it("refuses an IRN already on another Bill, naming that Bill", async () => {
    const world = await buildEinvoicingWorld();
    const first = await placeBill(world);
    const second = await placeBill(world);
    await harness.gstService.enterIrn(world.admin.id, { billId: first.billId, ...irnFields("1") });

    const error = await rejectionOf(
      harness.gstService.enterIrn(world.admin.id, {
        billId: second.billId,
        ...irnFields("1", { ackNumber: "999" }),
      }),
    );

    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(error.message).toContain(`Bill ${first.billNumber}`);
    expect((await billRow(second.billId)).irn).toBeNull();
  });

  it("is allowed after the month is filed", async () => {
    const { world, placed } = await pendingBill();
    setBusinessDay("2026-11-03");
    await harness.gstService.recordGstr1Filing(world.admin.id, {
      month: "2026-10",
      filedOn: "2026-11-03",
      reference: "OCT",
    });

    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });

    expect((await billRow(placed.billId)).irn).toBe(irnOf("1"));
  });

  it("after IRN, Spec G's line Correct and plain Cancel are refused", async () => {
    const { world, placed } = await pendingBill();
    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });
    const [line] = (await versionsOf(placed.billId))[0]!.items as Array<{ id: string }>;

    const correct = await refusalOf(
      harness.adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: line!.id, quantity: 2 }],
        reason: "Wrong qty",
      }),
    );
    const cancel = await refusalOf(
      harness.adminBillService.cancelBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        reason: "Wrong shop",
      }),
    );

    expect(correct).toEqual({ reason: "bill_locked", details: { lockReason: "irn_recorded" } });
    expect(cancel).toEqual({ reason: "bill_locked", details: { lockReason: "irn_recorded" } });
  });

  it("refuses an ack date that is not on the calendar before it reaches the database", async () => {
    const { world, placed } = await pendingBill();

    for (const ackDate of ["2026-02-30", "2026-13-01", "2026-10-00"]) {
      await expect(
        harness.gstService.enterIrn(world.admin.id, {
          billId: placed.billId,
          ...irnFields("1", { ackDate }),
        }),
      ).rejects.toThrow(/real calendar date/);
    }

    expect((await billRow(placed.billId)).irn).toBeNull();
    expect(harness.gstOutcomes).toEqual([]);
  });

  it("gate refusals carry Spec G's machine reason: bill_locked with lockReason, or bill_cancelled", async () => {
    const world = await buildEinvoicingWorld();
    const billOfSupply = await placeBill(world, { curd: 1 });
    const recorded = await placeBill(world);
    await harness.gstService.enterIrn(world.admin.id, {
      billId: recorded.billId,
      ...irnFields("1"),
    });
    const cancelled = await placeBill(world);
    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: cancelled.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });
    const notApplicable = await placeBill(await withCustomer(world, { einvoicing: false }));
    const refuse = (billId: string, seed: string) =>
      rejectionOf(harness.gstService.enterIrn(world.admin.id, { billId, ...irnFields(seed) }));

    const errors = [
      await refuse(billOfSupply.billId, "2"),
      await refuse(notApplicable.billId, "3"),
      await refuse(recorded.billId, "4"),
      await refuse(cancelled.billId, "5"),
    ];

    expect(errors.map((error) => error.code)).toEqual(Array(4).fill("CONFLICT"));
    expect(errors.map((error) => refusalCarriedBy(error))).toEqual([
      { reason: "bill_locked", details: { lockReason: "bill_of_supply" } },
      { reason: "bill_locked", details: { lockReason: "einvoicing_not_required" } },
      { reason: "bill_locked", details: { lockReason: "irn_already_recorded" } },
      { reason: "bill_cancelled", details: null },
    ]);
  });

  it("two Admins putting one IRN on two Bills at once: one lands, the other is told the Bill by the unique constraint", async () => {
    const world = await buildEinvoicingWorld();
    const first = await placeBill(world);
    const second = await placeBill(world);
    // Both calls pass the IRN-unused check, then meet here (the image is stored just before the
    // write), so neither sees the other's IRN until the unique constraint does.
    let arrived = 0;
    let bothArrived!: () => void;
    const meeting = new Promise<void>((resolve) => {
      bothArrived = resolve;
    });
    class MeetingDocuments extends DocumentService {
      public override async putSignedQrImage(
        input: Parameters<DocumentService["putSignedQrImage"]>[0],
      ) {
        arrived += 1;
        if (arrived === 2) bothArrived();
        await meeting;
        return super.putSignedQrImage(input);
      }
    }
    const service = new GstService(new MeetingDocuments(harness.store), (outcome) => {
      harness.gstOutcomes.push(outcome);
    });
    const enter = (billId: string, ackNumber: string) =>
      service.enterIrn(world.admin.id, {
        billId,
        ...irnFields("1", { ackNumber }),
        signedQrImage: png,
      });

    const results = await Promise.allSettled([
      enter(first.billId, "111"),
      enter(second.billId, "222"),
    ]);

    expect(arrived).toBe(2);
    const landed = results.findIndex((result) => result.status === "fulfilled");
    const [winner, loser] = landed === 0 ? [first, second] : [second, first];
    expect(landed).toBeGreaterThanOrEqual(0);
    const refused = results[1 - landed] as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: "CONFLICT" });
    expect(refused.reason.message).toContain(
      `IRN ${irnOf("1")} is already recorded on Bill ${winner.billNumber}`,
    );
    expect((await billRow(winner.billId)).irn).toBe(irnOf("1"));
    expect(await billRow(loser.billId)).toMatchObject({ irn: null, signedQrImageKey: null });
    expect(await irnAuditRows(loser.billId)).toEqual([]);
    expect(harness.gstOutcomes).toEqual([expect.objectContaining({ billId: winner.billId })]);
  });

  it("a throwing listener never rolls the IRN back", async () => {
    const { world, placed } = await pendingBill();
    const throwing = new GstService(new DocumentService(harness.store), () => {
      throw new Error("WhatsApp down");
    });

    await throwing.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });

    expect((await billRow(placed.billId)).irn).toBe(irnOf("1"));
  });
});

describe("GstService.correctIrn", () => {
  async function recordedBill() {
    const { world, placed } = await pendingBill();
    const entered = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
      signedQrImage: png,
    });
    harness.gstOutcomes.length = 0;
    setBusinessDay("2026-10-26");
    return { world, placed, entered };
  }

  it("overwrites the fields with a reason, moves recorded at/by, audits old and new and tells Spec J", async () => {
    const { world, placed, entered } = await recordedBill();
    const result = await harness.gstService.correctIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("2"),
      reason: "Copied the wrong IRN",
    });

    const correctedAt = new Date("2026-10-26T06:00:00Z");
    expect(result).toMatchObject({
      irn: irnOf("2"),
      ackNumber: "11232",
      signedQrText: "signed-qr-2",
      hasSignedQrImage: false,
      irnRecordedAt: correctedAt,
      balanceAfterPaise: placed.balancePaise,
      irnCorrectReason: "Copied the wrong IRN",
    });
    expect((await billRow(placed.billId)).signedQrImageKey).toBeNull();
    const audits = await irnAuditRows(placed.billId);
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({
      reason: "Copied the wrong IRN",
      customerId: world.customer.id,
      payload: {
        irn: { old: irnOf("1"), new: irnOf("2") },
        irnAckNumber: { old: "11231", new: "11232" },
        signedQrText: { old: "signed-qr-1", new: "signed-qr-2" },
        signedQrImageKey: {
          old: `documents/bills/${placed.billId}/signed-qr-${entered.irnRecordedAt.getTime()}.png`,
          new: null,
        },
      },
    });
    expect(harness.gstOutcomes).toEqual([
      {
        kind: "irn_corrected",
        billId: placed.billId,
        billNumber: placed.billNumber,
        customerId: world.customer.id,
        versionNumber: 1,
        irnRecordedAt: correctedAt,
        reason: "Copied the wrong IRN",
      },
    ]);
    // No new Bill version.
    expect(await versionsOf(placed.billId)).toHaveLength(1);
  });

  it("a new image gets a new key; the old object stays in the store", async () => {
    const { world, placed, entered } = await recordedBill();
    const oldKey = `documents/bills/${placed.billId}/signed-qr-${entered.irnRecordedAt.getTime()}.png`;

    const result = await harness.gstService.correctIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
      signedQrImage: { contentType: "image/jpeg", base64: imageBase64([0xff, 0xd8, 0xff]) },
      reason: "Clearer image",
    });

    const newKey = `documents/bills/${placed.billId}/signed-qr-${result.irnRecordedAt.getTime()}.jpg`;
    expect(newKey).not.toBe(oldKey);
    expect((await billRow(placed.billId)).signedQrImageKey).toBe(newKey);
    expect([...harness.store.objects.keys()].sort()).toEqual([oldKey, newKey].sort());
  });

  it("requires a reason and refuses a Bill without IRN or a cancelled one", async () => {
    const { world, placed } = await pendingBill();

    await expect(
      harness.gstService.correctIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        reason: "",
      }),
    ).rejects.toThrow(/reason is required/);
    const noIrn = await rejectionOf(
      harness.gstService.correctIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        reason: "Typo",
      }),
    );
    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });
    await harness.gstService.recordPortalCancellation(world.admin.id, {
      billId: placed.billId,
      ackNumber: "CNL-1",
      ackDate: "2026-10-25",
      reason: "Cancelled on the portal",
    });
    const cancelled = await rejectionOf(
      harness.gstService.correctIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("2"),
        reason: "Typo",
      }),
    );

    expect(noIrn.message).toContain("Use Enter IRN");
    expect(cancelled.message).toContain("is cancelled");
  });

  it("keeps the IRN unique across Bills", async () => {
    const world = await buildEinvoicingWorld();
    const first = await placeBill(world);
    const second = await placeBill(world);
    await harness.gstService.enterIrn(world.admin.id, { billId: first.billId, ...irnFields("1") });
    await harness.gstService.enterIrn(world.admin.id, { billId: second.billId, ...irnFields("2") });

    const error = await rejectionOf(
      harness.gstService.correctIrn(world.admin.id, {
        billId: second.billId,
        ...irnFields("1"),
        reason: "Typo",
      }),
    );

    expect(error.message).toContain(`Bill ${first.billNumber}`);
    expect((await billRow(second.billId)).irn).toBe(irnOf("2"));
  });

  it("is allowed in a filed month and still never unlocks Spec G's Correct", async () => {
    const { world, placed } = await recordedBill();
    setBusinessDay("2026-11-03");
    await harness.gstService.recordGstr1Filing(world.admin.id, {
      month: "2026-10",
      filedOn: "2026-11-03",
      reference: "OCT",
    });

    await harness.gstService.correctIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("2"),
      reason: "Typo",
    });
    const [line] = (await versionsOf(placed.billId))[0]!.items as Array<{ id: string }>;
    const correct = await refusalOf(
      harness.adminBillService.correctBill(world.admin.id, {
        billId: placed.billId,
        expectedVersionNumber: 1,
        lines: [{ lineId: line!.id, quantity: 2 }],
        reason: "Wrong qty",
      }),
    );

    expect((await billRow(placed.billId)).irn).toBe(irnOf("2"));
    expect(correct.reason).toBe("bill_locked");
    expect((await harness.gstService.getBillGstState({ billId: placed.billId })).irn).toMatchObject(
      { correctReason: "Typo", recordedByName: world.admin.name },
    );
  });

  it("refuses an ack date that is not on the calendar and keeps the recorded IRN", async () => {
    const { world, placed } = await recordedBill();

    await expect(
      harness.gstService.correctIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("2", { ackDate: "2026-02-30" }),
        reason: "Typo",
      }),
    ).rejects.toThrow(/real calendar date/);

    expect(await billRow(placed.billId)).toMatchObject({
      irn: irnOf("1"),
      irnAckDate: "2026-10-25",
      irnCorrectReason: null,
    });
    expect(harness.gstOutcomes).toEqual([]);
  });

  it("gate refusals carry Spec G's machine reason", async () => {
    const { world, placed } = await pendingBill();

    const noIrn = await refusalOf(
      harness.gstService.correctIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        reason: "Typo",
      }),
    );

    expect(noIrn).toEqual({ reason: "bill_locked", details: { lockReason: "irn_missing" } });
  });

  it("a throwing listener never rolls the corrected IRN back", async () => {
    const { world, placed } = await recordedBill();
    const throwing = new GstService(new DocumentService(harness.store), () => {
      throw new Error("WhatsApp down");
    });

    const result = await throwing.correctIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("2"),
      reason: "Copied the wrong IRN",
    });

    expect(result.irn).toBe(irnOf("2"));
    expect(await billRow(placed.billId)).toMatchObject({
      irn: irnOf("2"),
      irnCorrectReason: "Copied the wrong IRN",
    });
    expect(await irnAuditRows(placed.billId)).toHaveLength(2);
  });

  it("delivers nothing on a refusal", async () => {
    const { world, placed } = await recordedBill();

    await rejectionOf(
      harness.gstService.correctIrn(world.admin.id, {
        billId: placed.billId,
        ...irnFields("1"),
        signedQrImage: { contentType: "image/png", base64: imageBase64(GIF_MAGIC) },
        reason: "Bad image",
      }),
    );

    expect(harness.gstOutcomes).toEqual([]);
    expect((await billRow(placed.billId)).irnCorrectReason).toBeNull();
  });
});

describe("GstService.getBillGstState IRN fields", () => {
  it("shows the IRN block with the recorder and no Correct reason after Enter IRN", async () => {
    const { world, placed } = await pendingBill();
    await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
      signedQrImage: png,
    });

    const state = await harness.gstService.getBillGstState({ billId: placed.billId });

    expect(state).toMatchObject({
      irnStatus: "recorded",
      irn: {
        irn: irnOf("1"),
        ackNumber: "11231",
        hasSignedQrImage: true,
        recordedByName: world.admin.name,
        correctReason: null,
      },
      allowed: {
        lineCorrect: false,
        cancel: false,
        portalCancel: true,
        enterIrn: false,
        correctIrn: true,
        raiseNote: true,
        draft: false,
      },
      portalCancellation: null,
    });
    expect(
      await db.select().from(auditLogsTable).where(eq(auditLogsTable.entityId, placed.billId)),
    ).toHaveLength(1);
  });
});
