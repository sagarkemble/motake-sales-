import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { describe, expect, it } from "vitest";

import { buildGatepass, buildProfile, buildSalesman, buildVariety } from "../test/builders";
import GatepassService from "./index";

const gatepassService = new GatepassService();
const businessDate = "2026-10-25";

describe("GatepassService sellable quantity", () => {
  it("shows issued minus sold as sellable on the salesman view and the allotment matrix", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const variety = await buildVariety();
    const gatepass = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate,
      lines: [{ varietyId: variety.id, issuedQty: 20 }],
    });
    const before = await gatepassService.getGatepassForSalesmanAndDate(salesman.id, businessDate);
    const gatepassItemId = before!.items[0]!.id;

    await gatepassService.recordSale({ gatepassItemId, quantity: 7 });
    await gatepassService.recordReturn({ gatepassItemId, returnedQty: 3 }, admin.id);

    const salesmanView = await gatepassService.getGatepassForSalesmanAndDate(
      salesman.id,
      businessDate,
    );
    expect(salesmanView?.gatepass.id).toBe(gatepass.id);
    expect(salesmanView?.items[0]).toMatchObject({
      issuedQty: 20,
      soldQty: 7,
      returnedQty: 3,
      sellableQty: 13,
    });
    const matrix = await gatepassService.getAllotmentMatrix(businessDate);
    expect(matrix[0]).toMatchObject({ issuedQty: 20, soldQty: 7, returnedQty: 3, sellableQty: 13 });
  });

  it("refuses a sale larger than issued minus sold", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const variety = await buildVariety();
    await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate,
      lines: [{ varietyId: variety.id, issuedQty: 5, soldQty: 4 }],
    });
    const view = await gatepassService.getGatepassForSalesmanAndDate(salesman.id, businessDate);

    await expect(
      gatepassService.recordSale({ gatepassItemId: view!.items[0]!.id, quantity: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("GatepassService audit", () => {
  it("records handover, return, verify and discrepancy flag against the GatePass", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const variety = await buildVariety();
    const verified = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate,
      lines: [{ varietyId: variety.id, issuedQty: 10, soldQty: 6 }],
    });
    const view = await gatepassService.getGatepassForSalesmanAndDate(salesman.id, businessDate);

    await gatepassService.recordReturn(
      { gatepassItemId: view!.items[0]!.id, returnedQty: 1 },
      admin.id,
    );
    await gatepassService.submitHandover({
      gatepassId: verified.id,
      salesmanId: salesman.id,
      items: [{ gatepassItemId: view!.items[0]!.id, returnedQty: 4 }],
    });
    await gatepassService.closeGatepass(verified.id, { closedBy: admin.id });

    const flagged = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate: "2026-10-24",
      status: "pending_verification",
      lines: [{ varietyId: variety.id, issuedQty: 3 }],
    });
    await gatepassService.flagGatepassDiscrepancy(flagged.id, {
      closedBy: admin.id,
      reason: "Two packs missing",
    });

    const verifiedRows = await listAuditLogsForEntity("gatepass", verified.id);
    expect(verifiedRows.map((row) => [row.action, row.actorId]).sort()).toEqual(
      [
        ["closed", admin.id],
        ["handover_submitted", salesman.id],
        ["updated", admin.id],
      ].sort(),
    );
    const flaggedRows = await listAuditLogsForEntity("gatepass", flagged.id);
    expect(flaggedRows).toHaveLength(1);
    expect(flaggedRows[0]).toMatchObject({
      action: "updated",
      actorId: admin.id,
      customerId: null,
      payload: {
        hasDiscrepancy: { from: false, to: true },
        status: { from: "pending_verification", to: "closed" },
        discrepancyReason: { from: null, to: "Two packs missing" },
      },
    });
  });
});
