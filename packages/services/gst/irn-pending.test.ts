import { randomUUID } from "node:crypto";

import { db } from "@repo/database";
import { sellerSettingsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import { BOOK_NOW_TOTAL_PAISE } from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import {
  buildEinvoicingWorld,
  buildGstHarness,
  irnFields,
  placeBill,
  setBusinessDay,
  withCustomer,
  type GstHarness,
} from "../test/gst-world";

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

async function pendingIds(): Promise<string[]> {
  const page = await harness.gstService.listIrnPending();
  expect(await harness.gstService.countIrnPending()).toBe(page.totalCount);
  return page.items.map((row) => row.billId);
}

describe("IRN pending", () => {
  it("lists an e-invoiced Tax Invoice with Bill number, Customer, Route, Bill date, total and filed flag", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);

    const page = await harness.gstService.listIrnPending();

    expect(page).toMatchObject({ totalCount: 1, page: 1 });
    expect(page.items).toEqual([
      {
        billId: placed.billId,
        number: placed.billNumber,
        customerId: world.customer.id,
        customerShopName: world.customer.shopName,
        routeName: world.route.name,
        routeCode: world.route.code,
        billDate: "2026-10-25",
        totalPaise: BOOK_NOW_TOTAL_PAISE,
        filedMonth: false,
      },
    ]);
    expect(await harness.gstService.countIrnPending()).toBe(1);
    expect(await harness.gstService.getBillGstState({ billId: placed.billId })).toMatchObject({
      irnPending: true,
      irnStatus: "pending",
      einvoicingApplies: true,
      allowed: { enterIrn: true, draft: true, correctIrn: false, portalCancel: false },
    });
  });

  it("excludes a Bill of Supply, a Customer without e-invoicing and a cancelled Bill", async () => {
    const world = await buildEinvoicingWorld();
    const billOfSupply = await placeBill(world, { curd: 2 });
    const cancelled = await placeBill(world);
    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: cancelled.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });
    const notApplicable = await placeBill(await withCustomer(world, { einvoicing: false }));

    expect(await pendingIds()).toEqual([]);
    for (const billId of [billOfSupply.billId, notApplicable.billId, cancelled.billId]) {
      expect((await harness.gstService.getBillGstState({ billId })).irnPending).toBe(false);
    }
    expect(
      (await harness.gstService.getBillGstState({ billId: billOfSupply.billId })).refusalReasons
        .enterIrn,
    ).toContain("Bill of Supply");
  });

  it("excludes a Bill once its IRN is recorded", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);

    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });

    expect(await pendingIds()).toEqual([]);
    expect(await harness.gstService.getBillGstState({ billId: placed.billId })).toMatchObject({
      irnStatus: "recorded",
      irnRecorded: true,
    });
  });

  it("needs the seller flag too: switched off, nothing is IRN pending", async () => {
    const world = await buildEinvoicingWorld();
    await placeBill(world);
    await db.update(sellerSettingsTable).set({ einvoicingRequired: false });

    expect(await pendingIds()).toEqual([]);
  });

  it("follows the Customer's live flag: switching it moves existing Bills out and back in", async () => {
    const world = await buildEinvoicingWorld();
    const placed = await placeBill(world);

    await customerService.updateCustomer(
      world.customer.id,
      { einvoicingRequired: false },
      world.admin.id,
    );
    const whileOff = await pendingIds();
    await customerService.updateCustomer(
      world.customer.id,
      { einvoicingRequired: true },
      world.admin.id,
    );

    expect(whileOff).toEqual([]);
    expect(await pendingIds()).toEqual([placed.billId]);
  });

  it("lists oldest Bill date first, then number, with the filed-month flag", async () => {
    const world = await buildEinvoicingWorld();
    setBusinessDay("2026-09-30");
    const older = await harness.adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: [{ varietyId: world.milk.id, quantity: 2 }],
      reason: "Office sale",
    });
    setBusinessDay("2026-10-25");
    const first = await placeBill(world);
    const second = await placeBill(world);
    await harness.gstService.recordGstr1Filing(world.admin.id, {
      month: "2026-09",
      filedOn: "2026-10-11",
      reference: "SEP",
    });

    const page = await harness.gstService.listIrnPending({ pageSize: 2 });

    expect(page).toMatchObject({ totalCount: 3, totalPages: 2 });
    expect(page.items.map((row) => [row.billId, row.filedMonth])).toEqual([
      [older.billId, true],
      [first.billId, false],
    ]);
    const next = await harness.gstService.listIrnPending({ page: 2, pageSize: 2 });
    expect(next.items.map((row) => row.billId)).toEqual([second.billId]);
  });
});
