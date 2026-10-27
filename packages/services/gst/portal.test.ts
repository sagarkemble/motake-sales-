import { randomUUID } from "node:crypto";

import { db, eq, sql } from "@repo/database";
import { auditLogsTable, billVersionsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BOOK_NOW_TOTAL_PAISE,
  billNetLedgerPaise,
  expectBalanceMatchesLedger,
  notesOf,
  refusalOf,
  soldQtyByVariety,
  versionsOf,
} from "../test/admin-bill-world";
import DocumentService from "../documents";
import type { CheckoutWorld } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import { printedText } from "../test/pdf-text";
import {
  KARNATAKA_GSTIN,
  MAHARASHTRA_GSTIN,
  billRow,
  buildEinvoicingWorld,
  buildGstHarness,
  irnFields,
  placeBill,
  rejectionOf,
  setBusinessDay,
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

let irnSeed = 0;

async function irnBill(existing?: CheckoutWorld) {
  const world = existing ?? (await buildEinvoicingWorld());
  const placed = await placeBill(world);
  irnSeed += 1;
  await harness.gstService.enterIrn(world.admin.id, {
    billId: placed.billId,
    ...irnFields(String(irnSeed)),
  });
  harness.gstOutcomes.length = 0;
  return { world, placed };
}

const portalAck = {
  ackNumber: "CNL-0001",
  ackDate: "2026-10-25",
  reason: "Cancelled on the portal",
};

async function portalAuditRows(billId: string) {
  return db
    .select()
    .from(auditLogsTable)
    .where(
      sql`${auditLogsTable.entityId} = ${billId} AND ${auditLogsTable.action} = 'portal_cancelled'`,
    );
}

describe("GstService.recordPortalCancellation", () => {
  it("writes the ack and audit, then runs Spec G's Cancel in the same transaction and tells G's listener", async () => {
    const { world, placed } = await irnBill();

    const result = await harness.gstService.recordPortalCancellation(world.admin.id, {
      billId: placed.billId,
      ...portalAck,
      notes: "Within 24 hours",
    });

    const [creditNote] = await notesOf(placed.billId);
    expect(creditNote).toMatchObject({
      kind: "gst_credit_note",
      amountPaise: BOOK_NOW_TOTAL_PAISE,
      reason: "Cancelled on the portal",
    });
    expect(result).toMatchObject({
      billId: placed.billId,
      stockRestored: true,
      balancePaise: 0,
      creditNote: { noteId: creditNote!.id, kind: "gst_credit_note" },
    });
    expect(await billRow(placed.billId)).toMatchObject({
      number: placed.billNumber,
      irn: irnFields(String(irnSeed)).irn,
      portalCancelAckNumber: "CNL-0001",
      portalCancelAckDate: "2026-10-25",
      portalCancelNotes: "Within 24 hours",
    });
    expect(await portalAuditRows(placed.billId)).toEqual([
      expect.objectContaining({
        actorId: world.admin.id,
        customerId: world.customer.id,
        reason: "Cancelled on the portal",
        payload: {
          portalCancelAckNumber: "CNL-0001",
          portalCancelAckDate: "2026-10-25",
          portalCancelNotes: "Within 24 hours",
        },
      }),
    ]);
    expect(await billNetLedgerPaise(placed.billId)).toBe(0);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(0);
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 0,
      [world.curd.id]: 0,
    });
    expect(harness.billOutcomes).toEqual([
      expect.objectContaining({
        kind: "bill_cancelled",
        billId: placed.billId,
        billNumber: placed.billNumber,
        reason: "Cancelled on the portal",
      }),
    ]);
    expect(harness.gstOutcomes).toEqual([]);
    expect(await harness.gstService.getBillGstState({ billId: placed.billId })).toMatchObject({
      cancelled: true,
      irnStatus: "portal_cancelled",
      portalCancellation: { ackNumber: "CNL-0001", ackDate: "2026-10-25" },
    });
  });

  it("refuses a Bill without IRN (use Cancel), a cancelled Bill and a filed month (Raise Note)", async () => {
    const world = await buildEinvoicingWorld();
    const noIrn = await placeBill(world);
    const { placed: filed } = await irnBill(world);
    const { placed: cancelled } = await irnBill(world);
    await harness.gstService.recordPortalCancellation(world.admin.id, {
      billId: cancelled.billId,
      ...portalAck,
    });
    harness.billOutcomes.length = 0;
    const refuse = async (billId: string) => {
      const error = await rejectionOf(
        harness.gstService.recordPortalCancellation(world.admin.id, { billId, ...portalAck }),
      );
      expect(error).toMatchObject({ code: "CONFLICT" });
      return error.message;
    };

    // Before the filing: no IRN, and already cancelled.
    const messages = [await refuse(noIrn.billId), await refuse(cancelled.billId)];
    setBusinessDay("2026-11-03");
    await harness.gstService.recordGstr1Filing(world.admin.id, {
      month: "2026-10",
      filedOn: "2026-11-03",
      reference: "OCT",
    });
    // In a filed month the Filed-month refusal comes first, IRN or not.
    messages.push(await refuse(filed.billId), await refuse(noIrn.billId));

    expect(messages[0]).toContain("Use Cancel");
    expect(messages[1]).toContain("is cancelled");
    expect(messages[2]).toContain("Raise Note instead");
    expect(messages[3]).toContain("Raise Note instead");
    expect((await billRow(filed.billId)).portalCancelAckNumber).toBeNull();
    expect(harness.billOutcomes).toEqual([]);
  });

  it("refuses an ack date in the future and a missing ack number or reason", async () => {
    const { world, placed } = await irnBill();

    const future = await rejectionOf(
      harness.gstService.recordPortalCancellation(world.admin.id, {
        billId: placed.billId,
        ...portalAck,
        ackDate: "2026-10-26",
      }),
    );
    await expect(
      harness.gstService.recordPortalCancellation(world.admin.id, {
        billId: placed.billId,
        ...portalAck,
        ackNumber: " ",
      }),
    ).rejects.toThrow(/ack number is required/);
    await expect(
      harness.gstService.recordPortalCancellation(world.admin.id, {
        billId: placed.billId,
        ...portalAck,
        reason: "",
      }),
    ).rejects.toThrow(/reason is required/);

    expect(future.message).toContain("future");
    expect((await billRow(placed.billId)).portalCancelAckNumber).toBeNull();
  });

  it("refuses an ack date that is not on the calendar before it reaches the database", async () => {
    const { world, placed } = await irnBill();

    await expect(
      harness.gstService.recordPortalCancellation(world.admin.id, {
        billId: placed.billId,
        ...portalAck,
        ackDate: "2026-02-30",
      }),
    ).rejects.toThrow(/real calendar date/);

    expect((await billRow(placed.billId)).portalCancelAckNumber).toBeNull();
    expect(await portalAuditRows(placed.billId)).toEqual([]);
    expect(harness.billOutcomes).toEqual([]);
  });

  it("gate refusals carry Spec G's machine reason: bill_locked with lockReason, or bill_cancelled", async () => {
    const world = await buildEinvoicingWorld();
    const noIrn = await placeBill(world);
    const { placed: cancelled } = await irnBill(world);
    await harness.gstService.recordPortalCancellation(world.admin.id, {
      billId: cancelled.billId,
      ...portalAck,
    });
    const { placed: filed } = await irnBill(world);
    const refuse = (billId: string) =>
      refusalOf(
        harness.gstService.recordPortalCancellation(world.admin.id, { billId, ...portalAck }),
      );

    const missing = await refuse(noIrn.billId);
    const alreadyCancelled = await refuse(cancelled.billId);
    setBusinessDay("2026-11-03");
    await harness.gstService.recordGstr1Filing(world.admin.id, {
      month: "2026-10",
      filedOn: "2026-11-03",
      reference: "OCT",
    });
    const monthFiled = await refuse(filed.billId);

    expect(missing).toEqual({ reason: "bill_locked", details: { lockReason: "irn_missing" } });
    expect(alreadyCancelled).toEqual({ reason: "bill_cancelled", details: null });
    expect(monthFiled).toEqual({ reason: "bill_locked", details: { lockReason: "month_filed" } });
  });

  it("a throwing listener never rolls the portal cancellation back", async () => {
    const { world, placed } = await irnBill();
    const throwing = new GstService(
      new DocumentService(harness.store),
      () => {},
      () => {
        throw new Error("WhatsApp down");
      },
    );

    const result = await throwing.recordPortalCancellation(world.admin.id, {
      billId: placed.billId,
      ...portalAck,
    });

    expect(result.billId).toBe(placed.billId);
    expect((await billRow(placed.billId)).portalCancelAckNumber).toBe("CNL-0001");
    expect(await notesOf(placed.billId)).toHaveLength(1);
    expect(await portalAuditRows(placed.billId)).toHaveLength(1);
    expect((await harness.gstService.getBillGstState({ billId: placed.billId })).cancelled).toBe(
      true,
    );
  });

  it("rolls the ack back when Spec G's Cancel refuses (nothing left uncredited)", async () => {
    const { world, placed } = await irnBill();
    const lines = (await versionsOf(placed.billId))[0]!.items as Array<{
      id: string;
      quantity: number;
    }>;
    await harness.adminBillService.raiseNote(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: lines.map((line) => ({ lineId: line.id, quantity: line.quantity })),
      reason: "All returned",
      idempotencyKey: randomUUID(),
    });

    const refusal = await refusalOf(
      harness.gstService.recordPortalCancellation(world.admin.id, {
        billId: placed.billId,
        ...portalAck,
      }),
    );

    expect(refusal.reason).toBe("nothing_to_cancel");
    expect(await billRow(placed.billId)).toMatchObject({
      portalCancelAckNumber: null,
      portalCancelAckDate: null,
    });
    expect(await portalAuditRows(placed.billId)).toEqual([]);
    expect(harness.billOutcomes).toEqual([]);
  });
});

describe("GstService.buildPortalJsonDraft", () => {
  it("builds the INV-01 draft from the current Bill: number, date, parties, CGST/SGST lines and totals in rupees", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);

    const draft = await harness.gstService.buildPortalJsonDraft({ billId: placed.billId });

    const bill = await billRow(placed.billId);
    const { document } = draft;
    expect(draft.filename).toBe(
      `Motake Bill ${placed.billNumber.replaceAll("/", "-")} DRAFT-IRN-PENDING.json`,
    );
    expect(document.MotakeDraft).toMatchObject({
      status: "DRAFT-IRN-PENDING",
      billId: placed.billId,
      versionNumber: 1,
    });
    expect(document.TranDtls).toEqual({
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      IgstOnIntra: "N",
    });
    expect(document.DocDtls).toEqual({ Typ: "INV", No: placed.billNumber, Dt: "25/10/2026" });
    expect(document.SellerDtls).toMatchObject({ Gstin: "27AAAAA0000A1Z5", Stcd: "27" });
    expect(document.BuyerDtls).toMatchObject({
      Gstin: MAHARASHTRA_GSTIN,
      LglNm: world.customer.shopName,
      Pos: "27",
      Stcd: "27",
    });
    expect(document.ValDtls).toEqual({
      AssVal: bill.taxablePaise / 100,
      CgstVal: bill.cgstPaise / 100,
      SgstVal: bill.sgstPaise / 100,
      IgstVal: 0,
      RndOffAmt: bill.roundOffPaise / 100,
      TotInvVal: 119,
    });
    const milk = document.ItemList.find((item) => item.HsnCd === "0401")!;
    expect(milk).toMatchObject({ Qty: 3, UnitPrice: 24.99, GstRt: 5, IgstAmt: 0, IsServc: "N" });
    expect(milk.CgstAmt).toBe(milk.SgstAmt);
    const itemTotal = document.ItemList.reduce((total, item) => total + item.TotItemVal * 100, 0);
    expect(Math.round(itemTotal) + bill.roundOffPaise).toBe(bill.totalPaise);
  });

  it("uses IGST for an inter-state Bill and the buyer GSTIN state as place of supply", async () => {
    const world = await buildEinvoicingWorld({
      businessDate: "2026-10-25",
      deliveryState: "Karnataka",
      gstin: KARNATAKA_GSTIN,
    });
    const placed = await placeBill(world, { milk: 4 });

    const { document } = await harness.gstService.buildPortalJsonDraft({ billId: placed.billId });

    const bill = await billRow(placed.billId);
    expect(bill.igstPaise).toBeGreaterThan(0);
    expect(document.BuyerDtls).toMatchObject({ Pos: "29", Stcd: "29" });
    expect(document.ValDtls).toMatchObject({
      CgstVal: 0,
      SgstVal: 0,
      IgstVal: bill.igstPaise / 100,
    });
    expect(document.ItemList[0]).toMatchObject({ CgstAmt: 0, SgstAmt: 0 });
  });

  it("is regenerated from the latest Bill after a Correct", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);
    const milkLine = (
      (await versionsOf(placed.billId))[0]!.items as Array<{
        id: string;
        stamp: { hsn: string };
      }>
    ).find((item) => item.stamp.hsn === "0401")!;
    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "Only one pack",
    });

    const { document } = await harness.gstService.buildPortalJsonDraft({ billId: placed.billId });

    expect(document.MotakeDraft.versionNumber).toBe(2);
    expect(document.ItemList.find((item) => item.HsnCd === "0401")?.Qty).toBe(1);
    expect(document.ValDtls.TotInvVal).toBe((await billRow(placed.billId)).totalPaise / 100);
  });

  it("is refused when the Bill is not IRN pending", async () => {
    const world = await buildEinvoicingWorld();
    const billOfSupply = await placeBill(world, { curd: 1 });
    const { placed: recorded } = await irnBill(world);

    for (const billId of [billOfSupply.billId, recorded.billId]) {
      expect((await refusalOf(harness.gstService.buildPortalJsonDraft({ billId }))).reason).toBe(
        "irn_not_pending",
      );
    }
  });
});

describe("GstService.drawDraftPdf", () => {
  it("returns a Draft PDF marked Draft — IRN pending, never stored and never a pdf_key", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);

    const draft = await harness.gstService.drawDraftPdf({ billId: placed.billId });

    const bytes = new Uint8Array(Buffer.from(draft.base64, "base64"));
    expect(draft).toMatchObject({
      filename: `Motake Bill ${placed.billNumber.replaceAll("/", "-")} DRAFT-IRN-PENDING.pdf`,
      contentType: "application/pdf",
    });
    expect(await printedText(bytes)).toContain("Draft — IRN pending");
    expect(harness.store.puts).toEqual([]);
    const [version] = await db
      .select()
      .from(billVersionsTable)
      .where(eq(billVersionsTable.billId, placed.billId));
    expect(version!.pdfKey).toBeNull();
  });

  it("is refused once the IRN is recorded", async () => {
    const { placed } = await irnBill();

    expect(
      (await refusalOf(harness.gstService.drawDraftPdf({ billId: placed.billId }))).reason,
    ).toBe("irn_not_pending");
  });
});
