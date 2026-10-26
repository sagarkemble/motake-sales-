import { db, eq } from "@repo/database";
import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { gatepassesTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGatepass,
  buildProduct,
  buildProfile,
  buildRoute,
  buildRoutePrice,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import GatepassService from "./index";

const gatepassService = new GatepassService();
const today = "2026-10-25";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 23:50 IST on 25 Oct 2026, still the 25th in Asia/Kolkata.
  vi.setSystemTime(new Date("2026-10-25T18:20:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// A Route with one priced variety, ready to allot on.
async function pricedRoute(overrides: Parameters<typeof buildRoute>[0] = {}) {
  const admin = await buildProfile();
  const { profile: salesman } = await buildSalesman();
  const route = await buildRoute(overrides);
  const variety = await buildVariety();
  await buildRoutePrice(route.id, variety.id, 2500);
  return { admin, salesman, route, variety };
}

describe("GatepassService allot on a Route", () => {
  it("stores the Route and records the allotment", async () => {
    const { admin, salesman, route, variety } = await pricedRoute({ name: "Kolhapur Allot" });

    const allotted = await gatepassService.allotGatepass({
      salesmanId: salesman.id,
      routeId: route.id,
      businessDate: today,
      issuedBy: admin.id,
      items: [{ varietyId: variety.id, issuedQty: 12 }],
    });

    expect(allotted.gatepass).toMatchObject({
      routeId: route.id,
      routeName: "Kolhapur Allot",
      routeCode: route.code,
      status: "active",
    });
    const rows = await listAuditLogsForEntity("gatepass", allotted.gatepass.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "allotted",
      actorId: admin.id,
      customerId: null,
      payload: {
        salesmanId: salesman.id,
        businessDate: today,
        routeId: route.id,
        items: [{ varietyId: variety.id, issuedQty: 12 }],
      },
    });
  });

  it("requires a Route", async () => {
    const { admin, salesman, variety } = await pricedRoute();

    await expect(
      gatepassService.allotGatepass({
        salesmanId: salesman.id,
        businessDate: today,
        issuedBy: admin.id,
        items: [{ varietyId: variety.id, issuedQty: 1 }],
      } as never),
    ).rejects.toThrow();
  });

  it("refuses a hidden Route and allows an Inactive one", async () => {
    const hidden = await pricedRoute({ name: "Hidden Allot", deletedAt: new Date() });
    const inactive = await pricedRoute({ name: "Inactive Allot", status: "inactive" });

    await expect(
      gatepassService.allotGatepass({
        salesmanId: hidden.salesman.id,
        routeId: hidden.route.id,
        businessDate: today,
        issuedBy: hidden.admin.id,
        items: [{ varietyId: hidden.variety.id, issuedQty: 1 }],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Route Hidden Allot is deleted. Pick another Route.",
    });

    const allotted = await gatepassService.allotGatepass({
      salesmanId: inactive.salesman.id,
      routeId: inactive.route.id,
      businessDate: today,
      issuedBy: inactive.admin.id,
      items: [{ varietyId: inactive.variety.id, issuedQty: 1 }],
    });
    expect(allotted.gatepass.routeId).toBe(inactive.route.id);
  });

  it("refuses varieties with no price on the Route, naming them", async () => {
    const { admin, salesman, route, variety } = await pricedRoute();
    const product = await buildProduct({ name: "Gokul Curd" });
    const unpriced = await buildVariety({ productId: product.id, name: "400 g" });
    const pricedElsewhere = await buildVariety({ productId: product.id, name: "1 kg" });
    await buildRoutePrice((await buildRoute()).id, pricedElsewhere.id, 9000);

    await expect(
      gatepassService.allotGatepass({
        salesmanId: salesman.id,
        routeId: route.id,
        businessDate: today,
        issuedBy: admin.id,
        items: [
          { varietyId: variety.id, issuedQty: 3 },
          { varietyId: unpriced.id, issuedQty: 2 },
          { varietyId: pricedElsewhere.id, issuedQty: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `No price on Route ${route.name} for: Gokul Curd 1 kg, Gokul Curd 400 g`,
    });
    expect(await gatepassService.getActiveGatepassForSalesman(salesman.id)).toBeNull();
  });

  it("allots alongside an unpriced variety at quantity 0, refusing it only above 0", async () => {
    const { admin, salesman, route, variety } = await pricedRoute();
    const product = await buildProduct({ name: "Warana Lassi" });
    const unpriced = await buildVariety({ productId: product.id, name: "200 ml" });
    const input = {
      salesmanId: salesman.id,
      routeId: route.id,
      businessDate: today,
      issuedBy: admin.id,
    };

    await expect(
      gatepassService.allotGatepass({
        ...input,
        items: [
          { varietyId: variety.id, issuedQty: 4 },
          { varietyId: unpriced.id, issuedQty: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `No price on Route ${route.name} for: Warana Lassi 200 ml`,
    });

    const allotted = await gatepassService.allotGatepass({
      ...input,
      items: [
        { varietyId: variety.id, issuedQty: 4 },
        { varietyId: unpriced.id, issuedQty: 0 },
      ],
    });
    expect(allotted.gatepass.routeId).toBe(route.id);
  });

  it("refuses the same variety twice in one allotment", async () => {
    const { admin, salesman, route, variety } = await pricedRoute();

    await expect(
      gatepassService.allotGatepass({
        salesmanId: salesman.id,
        routeId: route.id,
        businessDate: today,
        issuedBy: admin.id,
        items: [
          { varietyId: variety.id, issuedQty: 2 },
          { varietyId: variety.id, issuedQty: 3 },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await gatepassService.getActiveGatepassForSalesman(salesman.id)).toBeNull();
  });

  it("still refuses a second Active GatePass for the salesman on the same date", async () => {
    const { admin, salesman, route, variety } = await pricedRoute();
    const input = {
      salesmanId: salesman.id,
      routeId: route.id,
      businessDate: today,
      issuedBy: admin.id,
      items: [{ varietyId: variety.id, issuedQty: 1 }],
    };
    await gatepassService.allotGatepass(input);

    await expect(gatepassService.allotGatepass(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("GatepassService reads with the Route", () => {
  it("returns Route name and code on the salesman view, date list, matrix and history", async () => {
    const { admin, salesman, route, variety } = await pricedRoute({ name: "Sangli Reads" });
    const allotted = await gatepassService.allotGatepass({
      salesmanId: salesman.id,
      routeId: route.id,
      businessDate: today,
      issuedBy: admin.id,
      items: [{ varietyId: variety.id, issuedQty: 4 }],
    });
    const routeLabel = { routeName: "Sangli Reads", routeCode: route.code };

    const mine = await gatepassService.getGatepassForSalesmanAndDate(salesman.id, today);
    expect(mine?.gatepass).toMatchObject(routeLabel);

    const forDate = await gatepassService.listGatepassesForDate(today);
    expect(forDate.find((row) => row.id === allotted.gatepass.id)).toMatchObject(routeLabel);

    const matrix = await gatepassService.getAllotmentMatrix(today);
    expect(matrix.find((row) => row.gatepassId === allotted.gatepass.id)).toMatchObject(routeLabel);

    const history = await gatepassService.getGatepassHistoryForSalesman(salesman.id);
    expect(history[0]).toMatchObject(routeLabel);
  });
});

describe("GatepassService Active GatePass", () => {
  it("returns today's active GatePass with its Route, and nothing after handover or close", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const route = await buildRoute({ name: "Miraj Active", deliveryState: "Maharashtra" });
    const gatepass = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      routeId: route.id,
      businessDate: today,
      lines: [],
    });

    const active = await gatepassService.getActiveGatepassForSalesman(salesman.id);
    expect(active?.gatepass.id).toBe(gatepass.id);
    expect(active?.route).toEqual({
      id: route.id,
      name: "Miraj Active",
      code: route.code,
      deliveryState: "Maharashtra",
      hidden: false,
    });

    await db
      .update(gatepassesTable)
      .set({ status: "pending_verification" })
      .where(eq(gatepassesTable.id, gatepass.id));
    expect(await gatepassService.getActiveGatepassForSalesman(salesman.id)).toBeNull();

    await db
      .update(gatepassesTable)
      .set({ status: "closed" })
      .where(eq(gatepassesTable.id, gatepass.id));
    expect(await gatepassService.getActiveGatepassForSalesman(salesman.id)).toBeNull();
  });

  it("ignores an active GatePass on another business date", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate: "2026-10-24",
      lines: [],
    });

    expect(await gatepassService.getActiveGatepassForSalesman(salesman.id)).toBeNull();

    // 00:10 IST on the 26th: the 25th's GatePass is no longer today's.
    await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate: today,
      lines: [],
    });
    vi.setSystemTime(new Date("2026-10-25T18:40:00Z"));
    expect(await gatepassService.getActiveGatepassForSalesman(salesman.id)).toBeNull();
  });
});
