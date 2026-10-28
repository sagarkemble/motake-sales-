import { asc, db, sql } from "@repo/database";
import { auditLogsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import { refusalOf } from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import {
  billRow,
  buildEinvoicingWorld,
  buildGstHarness,
  irnFields,
  irnOf,
  placeBill,
  setBusinessDay,
  type GstHarness,
} from "../test/gst-world";

// A deactivated Customer is read-only: Enter IRN and Correct IRN on its Bills are refused as
// customer_inactive and write nothing, while the IRN pending list, count, Bill GST state and
// drafts still read them.

let harness: GstHarness;
const customerService = new CustomerService();

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  setBusinessDay("2026-10-25");
  harness = buildGstHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

async function irnAuditRows(billId: string) {
  return db
    .select()
    .from(auditLogsTable)
    .where(
      sql`${auditLogsTable.entityId} = ${billId} AND ${auditLogsTable.action} = 'irn_recorded'`,
    )
    .orderBy(asc(auditLogsTable.createdAt));
}

describe("GST on a deactivated Customer's Bill", () => {
  it("refuses Enter IRN as customer_inactive and writes nothing", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);
    await customerService.deactivateCustomer(world.customer.id, world.admin.id);

    const enter = harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
    });
    await expect(enter).rejects.toThrow(`${world.customer.shopName} is inactive`);
    expect(await refusalOf(enter)).toEqual({
      reason: "customer_inactive",
      details: { customerId: world.customer.id },
    });

    expect(await billRow(placed.billId)).toMatchObject({
      irn: null,
      irnAckNumber: null,
      irnAckDate: null,
      signedQrText: null,
      signedQrImageKey: null,
      irnRecordedAt: null,
      irnRecordedBy: null,
    });
    expect(await irnAuditRows(placed.billId)).toEqual([]);
    expect(harness.store.puts).toEqual([]);
    expect(harness.gstOutcomes).toEqual([]);
  });

  it("refuses Correct IRN as customer_inactive and keeps the recorded IRN", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);
    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });
    await customerService.deactivateCustomer(world.customer.id, world.admin.id);
    const before = await billRow(placed.billId);
    harness.gstOutcomes.length = 0;

    expect(
      await refusalOf(
        harness.gstService.correctIrn(world.admin.id, {
          billId: placed.billId,
          ...irnFields("2"),
          reason: "Typo in the IRN",
        }),
      ),
    ).toMatchObject({ reason: "customer_inactive", details: { customerId: world.customer.id } });

    expect(await billRow(placed.billId)).toEqual(before);
    expect(await irnAuditRows(placed.billId)).toHaveLength(1);
    expect(harness.store.puts).toEqual([]);
    expect(harness.gstOutcomes).toEqual([]);
  });

  it("still lists, counts and shows the Bill, with Enter IRN unavailable for the Customer", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);
    await customerService.deactivateCustomer(world.customer.id, world.admin.id);

    const page = await harness.gstService.listIrnPending();
    expect(page.items.map((row) => row.billId)).toEqual([placed.billId]);
    expect(await harness.gstService.countIrnPending()).toBe(1);

    const state = await harness.gstService.getBillGstState({ billId: placed.billId });
    expect(state).toMatchObject({
      irnPending: true,
      irnStatus: "pending",
      allowed: { enterIrn: false, correctIrn: false, portalCancel: false, draft: true },
    });
    expect(state.refusalReasons.enterIrn).toBe(`${world.customer.shopName} is inactive`);

    const draft = await harness.gstService.buildPortalJsonDraft({ billId: placed.billId });
    expect(draft.document.DocDtls.No).toBe(placed.billNumber);
    const paper = await harness.adminBillService.getBillPaper({ billId: placed.billId });
    expect(paper.customer?.status).toBe("inactive");
  });

  it("shows Correct IRN and portal cancellation unavailable for the Customer once an IRN is on the Bill", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);
    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });
    await customerService.deactivateCustomer(world.customer.id, world.admin.id);

    const state = await harness.gstService.getBillGstState({ billId: placed.billId });
    expect(state).toMatchObject({
      irnStatus: "recorded",
      irn: { irn: irnOf("1") },
      allowed: { enterIrn: false, correctIrn: false, portalCancel: false },
    });
    expect(state.refusalReasons.correctIrn).toBe(`${world.customer.shopName} is inactive`);
    expect(state.refusalReasons.portalCancel).toBe(`${world.customer.shopName} is inactive`);
    // The Bill's own gate still comes first.
    expect(state.refusalReasons.enterIrn).toBe("IRN already recorded — use Correct IRN.");
  });
});
