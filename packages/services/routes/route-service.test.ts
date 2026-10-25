import { db, eq } from "@repo/database";
import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { gatepassesTable, ordersTable } from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import {
  buildCustomer,
  buildGatepass,
  buildOrder,
  buildProfile,
  buildRoute,
  buildRoutePrice,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import RouteService from "./index";

const routeService = new RouteService();

// Tables are wiped per file, so every test uses its own Route names and reads codes relatively.
function counterOf(code: string): number {
  return Number(/-(\d+)$/.exec(code)![1]);
}

describe("RouteService create and rename", () => {
  it("generates rt-{slug}-{nnn} with one counter across different slugs", async () => {
    const admin = await buildProfile();

    const kolhapur = await routeService.createRoute(
      { name: "  Kolhapur   City ", deliveryState: "Maharashtra" },
      admin.id,
    );
    const satara = await routeService.createRoute(
      { name: "Satara", deliveryState: "Maharashtra" },
      admin.id,
    );

    expect(kolhapur).toMatchObject({
      name: "Kolhapur City",
      deliveryState: "Maharashtra",
      status: "active",
      deletedAt: null,
    });
    expect(kolhapur.code).toMatch(/^rt-kolhapur-city-\d{3}$/);
    const next = String(counterOf(kolhapur.code) + 1).padStart(3, "0");
    expect(satara.code).toBe(`rt-satara-${next}`);
  });

  it("drops accents from the code slug", async () => {
    const admin = await buildProfile();

    const route = await routeService.createRoute(
      { name: "Kolhāpur", deliveryState: "Maharashtra" },
      admin.id,
    );

    expect(route.code).toMatch(/^rt-kolhapur-\d{3}$/);
  });

  it("checks the name length after trimming and collapsing whitespace", async () => {
    const admin = await buildProfile();
    const name = `${"Shirol ".repeat(17)}Ok`.slice(0, 120);
    const padded = `   ${name.replace(/ /g, "   ")}   `;
    expect(padded.length).toBeGreaterThan(120);

    const route = await routeService.createRoute(
      { name: padded, deliveryState: "Maharashtra" },
      admin.id,
    );

    expect(route.name).toBe(name);
    await expect(
      routeService.createRoute({ name: `${name}x`, deliveryState: "Maharashtra" }, admin.id),
    ).rejects.toThrow();
  });

  it("treats an update with no changes as a no-op without an audit row", async () => {
    const admin = await buildProfile();
    const route = await routeService.createRoute(
      { name: "Ajara No-op", deliveryState: "Maharashtra" },
      admin.id,
    );

    const unchanged = await routeService.updateRoute(route.id, {}, admin.id);

    expect(unchanged).toEqual(route);
    const rows = await listAuditLogsForEntity("route", route.id);
    expect(rows.map((row) => row.action)).toEqual(["created"]);
  });

  it("gives a name with no ASCII letters or digits the code rt-{nnn}", async () => {
    const admin = await buildProfile();

    const route = await routeService.createRoute(
      { name: "कोल्हापूर", deliveryState: "Maharashtra" },
      admin.id,
    );

    expect(route.code).toMatch(/^rt-\d{3,}$/);
  });

  it("cuts a long name so the code fits 64 characters", async () => {
    const admin = await buildProfile();

    const route = await routeService.createRoute(
      { name: "Ichalkaranji ".repeat(9), deliveryState: "Maharashtra" },
      admin.id,
    );

    expect(route.code.length).toBeLessThanOrEqual(64);
    expect(route.code).toMatch(/^rt-ichalkaranji-[a-z-]*[a-z]-\d{3}$/);
  });

  it("keeps the code on rename", async () => {
    const admin = await buildProfile();
    const route = await routeService.createRoute(
      { name: "Kagal", deliveryState: "Maharashtra" },
      admin.id,
    );

    const renamed = await routeService.updateRoute(route.id, { name: "Kagal East" }, admin.id);

    expect(renamed).toMatchObject({ name: "Kagal East", code: route.code });
  });

  it("refuses a name another Route has in any letter case, including a hidden Route", async () => {
    const admin = await buildProfile();
    await buildRoute({ name: "Wai", deletedAt: new Date() });
    const other = await routeService.createRoute(
      { name: "Phaltan", deliveryState: "Maharashtra" },
      admin.id,
    );

    await expect(
      routeService.createRoute({ name: "WAI", deliveryState: "Maharashtra" }, admin.id),
    ).rejects.toMatchObject({ code: "CONFLICT", message: 'A Route named "WAI" already exists' });
    await expect(
      routeService.updateRoute(other.id, { name: "wai" }, admin.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows changing only the letter case of a Route's own name", async () => {
    const admin = await buildProfile();
    const route = await routeService.createRoute(
      { name: "karad", deliveryState: "Maharashtra" },
      admin.id,
    );

    const renamed = await routeService.updateRoute(route.id, { name: "Karad" }, admin.id);

    expect(renamed.name).toBe("Karad");
  });

  it("leaves one Route when two creates differ only in letter case", async () => {
    const admin = await buildProfile();

    const results = await Promise.allSettled([
      routeService.createRoute({ name: "Miraj", deliveryState: "Maharashtra" }, admin.id),
      routeService.createRoute({ name: "MIRAJ", deliveryState: "Maharashtra" }, admin.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const listed = await routeService.listRoutes({ search: "miraj", includeHidden: true });
    expect(listed).toHaveLength(1);
  });

  it("refuses a delivery state outside the list", async () => {
    const admin = await buildProfile();

    await expect(
      routeService.createRoute(
        { name: "Panhala", deliveryState: "maharashtra" as never },
        admin.id,
      ),
    ).rejects.toThrow();
    const route = await routeService.createRoute(
      { name: "Panhala", deliveryState: "Maharashtra" },
      admin.id,
    );
    await expect(
      routeService.updateRoute(route.id, { deliveryState: "MH" as never }, admin.id),
    ).rejects.toThrow();

    const moved = await routeService.updateRoute(
      route.id,
      { deliveryState: "Dadra and Nagar Haveli and Daman and Diu" },
      admin.id,
    );
    expect(moved.deliveryState).toBe("Dadra and Nagar Haveli and Daman and Diu");
  });
});

describe("RouteService status and hide", () => {
  async function routeInUse(name: string) {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const route = await buildRoute({ name });
    const variety = await buildVariety();
    const gatepass = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      routeId: route.id,
      lines: [{ varietyId: variety.id, issuedQty: 5 }],
    });
    const customer = await buildCustomer(admin.id, { routeId: route.id });
    const { order: preorder } = await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      lines: [{ variety, quantity: 1, routePricePaise: 1000 }],
    });
    return { admin, route, gatepass, preorder };
  }

  it("switches Active / Inactive with an Active GatePass and an open Pre-order present", async () => {
    const { admin, route } = await routeInUse("Ajara");

    const inactive = await routeService.setRouteStatus(route.id, "inactive", admin.id);
    const active = await routeService.setRouteStatus(route.id, "active", admin.id);

    expect(inactive.status).toBe("inactive");
    expect(active.status).toBe("active");
  });

  it("refuses Hide with the Active GatePass and open Pre-order counts", async () => {
    const { admin, route } = await routeInUse("Gadhinglaj");

    await expect(routeService.hideRoute(route.id, admin.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Gadhinglaj has 1 Active GatePass and 1 open Pre-order. Close them before hiding the Route.",
    });
  });

  it("refuses Hide with only an Active GatePass, then allows it after handover", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const route = await buildRoute({ name: "Koregaon" });
    const gatepass = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      routeId: route.id,
      lines: [],
    });

    await expect(routeService.hideRoute(route.id, admin.id)).rejects.toMatchObject({
      message:
        "Koregaon has 1 Active GatePass and 0 open Pre-orders. Close them before hiding the Route.",
    });

    await db
      .update(gatepassesTable)
      .set({ status: "pending_verification" })
      .where(eq(gatepassesTable.id, gatepass.id));
    const hidden = await routeService.hideRoute(route.id, admin.id);
    expect(hidden.deletedAt).not.toBeNull();
  });

  it("allows Hide once the GatePass is closed and the Pre-order fulfilled or cancelled", async () => {
    const { admin, route, gatepass, preorder } = await routeInUse("Chandgad");
    await db
      .update(gatepassesTable)
      .set({ status: "closed" })
      .where(eq(gatepassesTable.id, gatepass.id));
    await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, preorder.id));

    const hidden = await routeService.hideRoute(route.id, admin.id);

    expect(hidden.deletedAt).not.toBeNull();
  });

  it("drops a hidden Route from lists and choices, keeps it with includeHidden, and shows it again", async () => {
    const admin = await buildProfile();
    const north = await buildRoute({ name: "Jat North" });
    const south = await buildRoute({ name: "Jat South" });
    const choiceIds = async () =>
      (await routeService.listRouteChoices())
        .map((row) => row.id)
        .filter((id) => id === north.id || id === south.id);

    await routeService.hideRoute(north.id, admin.id);

    expect((await routeService.listRoutes({ search: "Jat" })).map((row) => row.name)).toEqual([
      "Jat South",
    ]);
    expect(await choiceIds()).toEqual([south.id]);
    const withHidden = await routeService.listRoutes({ search: "Jat", includeHidden: true });
    expect(withHidden.map((row) => [row.name, row.hidden])).toEqual([
      ["Jat North", true],
      ["Jat South", false],
    ]);

    await routeService.showRoute(north.id, admin.id);
    expect((await routeService.listRoutes({ search: "Jat" })).map((row) => row.name)).toEqual([
      "Jat North",
      "Jat South",
    ]);
    expect(await choiceIds()).toEqual([north.id, south.id]);
  });

  it("keeps Inactive Routes in choices and leaves out the excluded Route", async () => {
    const current = await buildRoute({ name: "Shahuwadi" });
    const inactive = await buildRoute({ name: "Radhanagari", status: "inactive" });

    const choices = await routeService.listRouteChoices({ excludeRouteId: current.id });

    expect(choices.map((choice) => choice.id)).not.toContain(current.id);
    expect(choices.find((choice) => choice.id === inactive.id)?.status).toBe("inactive");
  });

  it("searches by name, code or delivery state", async () => {
    await buildRoute({ name: "Margao Town", code: "rt-margao-town-901" });
    await buildRoute({ name: "Gangtok", deliveryState: "Sikkim" });

    expect((await routeService.listRoutes({ search: "sikkim" })).map((r) => r.name)).toEqual([
      "Gangtok",
    ]);
    expect((await routeService.listRoutes({ search: "RT-MARGAO" })).map((r) => r.name)).toEqual([
      "Margao Town",
    ]);
    expect((await routeService.listRoutes({ search: "gangt" })).map((r) => r.name)).toEqual([
      "Gangtok",
    ]);
  });
});

describe("RouteService prices", () => {
  it("inserts then overwrites one price row", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();
    const variety = await buildVariety();

    await routeService.setRoutePrice(
      { routeId: route.id, varietyId: variety.id, pricePaise: 2500 },
      admin.id,
    );
    await routeService.setRoutePrice(
      { routeId: route.id, varietyId: variety.id, pricePaise: 2750 },
      admin.id,
    );

    const prices = await routeService.listPricesForRoute(route.id);
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ varietyId: variety.id, pricePaise: 2750 });
    expect(await routeService.getRoutePrice(route.id, variety.id)).toMatchObject({
      pricePaise: 2750,
    });
  });

  it("refuses zero, negative and non-integer paise", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();
    const variety = await buildVariety();

    for (const pricePaise of [0, -100, 12.5]) {
      await expect(
        routeService.setRoutePrice(
          { routeId: route.id, varietyId: variety.id, pricePaise },
          admin.id,
        ),
      ).rejects.toThrow();
    }
    expect(await routeService.getRoutePrice(route.id, variety.id)).toBeNull();
  });

  it("refuses a price for a variety that does not exist", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();

    await expect(
      routeService.setRoutePrice(
        { routeId: route.id, varietyId: "00000000-0000-4000-8000-000000000000", pricePaise: 100 },
        admin.id,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("clears a price and treats clearing a missing price as a no-op", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();
    const variety = await buildVariety();
    await buildRoutePrice(route.id, variety.id, 1500);

    await routeService.clearRoutePrice({ routeId: route.id, varietyId: variety.id }, admin.id);
    await routeService.clearRoutePrice({ routeId: route.id, varietyId: variety.id }, admin.id);

    expect(await routeService.getRoutePrice(route.id, variety.id)).toBeNull();
  });

  it("counts priced varieties on the list and gives a new variety no price anywhere", async () => {
    const route = await buildRoute({ name: "Shirol" });
    const priced = await buildVariety();
    await buildRoutePrice(route.id, priced.id, 1000);
    const fresh = await buildVariety();

    const [row] = await routeService.listRoutes({ search: "Shirol" });
    expect(row?.pricedVarietyCount).toBe(1);

    const { varieties } = await routeService.getRoute(route.id);
    expect(varieties.find((v) => v.varietyId === priced.id)).toMatchObject({
      pricePaise: 1000,
      pricedOnAnyRoute: true,
    });
    expect(varieties.find((v) => v.varietyId === fresh.id)).toMatchObject({
      pricePaise: null,
      pricedOnAnyRoute: false,
      varietyActive: true,
    });
  });

  it("keeps an inactive variety on the price form only while it has a price here", async () => {
    const route = await buildRoute();
    const pricedInactive = await buildVariety({ status: "inactive", deletedAt: new Date() });
    const unpricedInactive = await buildVariety({ status: "inactive", deletedAt: new Date() });
    await buildRoutePrice(route.id, pricedInactive.id, 900);

    const { varieties } = await routeService.getRoute(route.id);

    expect(varieties.map((v) => v.varietyId)).toContain(pricedInactive.id);
    expect(varieties.map((v) => v.varietyId)).not.toContain(unpricedInactive.id);
    expect(varieties.find((v) => v.varietyId === pricedInactive.id)?.varietyActive).toBe(false);
  });
});

describe("RouteService audit", () => {
  it("records every Route write", async () => {
    const admin = await buildProfile();
    const route = await routeService.createRoute(
      { name: "Hatkanangle", deliveryState: "Maharashtra" },
      admin.id,
    );
    await routeService.updateRoute(
      route.id,
      { name: "Hatkanangle East", deliveryState: "Goa" },
      admin.id,
    );
    await routeService.setRouteStatus(route.id, "inactive", admin.id);
    await routeService.setRouteStatus(route.id, "active", admin.id);
    await routeService.hideRoute(route.id, admin.id);
    await routeService.showRoute(route.id, admin.id);

    const rows = await listAuditLogsForEntity("route", route.id);
    expect(rows.map((row) => row.action).sort()).toEqual(
      ["activated", "created", "deactivated", "deleted", "updated", "updated"].sort(),
    );
    expect(rows.every((row) => row.actorId === admin.id && row.customerId === null)).toBe(true);
    expect(rows.find((row) => row.action === "created")?.payload).toEqual({
      name: "Hatkanangle",
      deliveryState: "Maharashtra",
      code: route.code,
    });
    const updates = rows.filter((row) => row.action === "updated").map((row) => row.payload);
    expect(updates).toContainEqual({
      name: { from: "Hatkanangle", to: "Hatkanangle East" },
      deliveryState: { from: "Maharashtra", to: "Goa" },
    });
    expect(updates).toContainEqual({ hidden: { from: true, to: false } });
  });

  it("records Route price create, update and delete with the paise", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();
    const variety = await buildVariety();

    const created = await routeService.setRoutePrice(
      { routeId: route.id, varietyId: variety.id, pricePaise: 2500 },
      admin.id,
    );
    await routeService.setRoutePrice(
      { routeId: route.id, varietyId: variety.id, pricePaise: 2750 },
      admin.id,
    );
    await routeService.clearRoutePrice({ routeId: route.id, varietyId: variety.id }, admin.id);

    const rows = await listAuditLogsForEntity("route_price", created.id);
    const byAction = Object.fromEntries(rows.map((row) => [row.action, row.payload]));
    expect(byAction).toEqual({
      created: {
        routeId: route.id,
        varietyId: variety.id,
        pricePaise: { from: null, to: 2500 },
      },
      updated: {
        routeId: route.id,
        varietyId: variety.id,
        pricePaise: { from: 2500, to: 2750 },
      },
      deleted: { routeId: route.id, varietyId: variety.id, pricePaise: 2750 },
    });
  });
});
