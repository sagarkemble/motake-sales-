import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildGatepass, buildProfile, buildRoute, buildSalesman } from "../test/builders";
import SalesmanService from "./index";

const salesmanService = new SalesmanService();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SalesmanService.listSalesmen", () => {
  it("names the Route of today's Active GatePass, else null", async () => {
    const admin = await buildProfile();
    const kolhapur = await buildRoute({ name: "Kolhapur" });
    const onRoute = await buildSalesman({ name: "On route" });
    const handedOver = await buildSalesman({ name: "Handed over" });
    const yesterdayOnly = await buildSalesman({ name: "Yesterday only" });
    await buildSalesman({ name: "No GatePass" });
    await buildGatepass({
      salesmanId: onRoute.profile.id,
      issuedBy: admin.id,
      routeId: kolhapur.id,
      lines: [],
    });
    await buildGatepass({
      salesmanId: handedOver.profile.id,
      issuedBy: admin.id,
      status: "closed",
      lines: [],
    });
    await buildGatepass({
      salesmanId: yesterdayOnly.profile.id,
      issuedBy: admin.id,
      businessDate: "2026-10-24",
      lines: [],
    });

    const page = await salesmanService.listSalesmen({ page: 1, pageSize: 20, includeDeleted: false });

    const routeByName = Object.fromEntries(
      page.items.map((row) => [row.profile.name, row.activeRouteName]),
    );
    expect(routeByName).toEqual({
      "On route": "Kolhapur",
      "Handed over": null,
      "Yesterday only": null,
      "No GatePass": null,
    });
    expect(page.totalCount).toBe(4);
  });
});
