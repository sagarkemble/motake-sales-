import { db, eq } from "@repo/database";
import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { customersTable, gatepassesTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCustomer,
  buildGatepass,
  buildOrder,
  buildProfile,
  buildRoute,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import CustomerService from "./index";

const customerService = new CustomerService();
const today = "2026-10-25";

function shopDetails(creatorId: string, overrides: Record<string, unknown> = {}) {
  return {
    shopName: "Ganesh Stores",
    phone: "9876543210",
    address: "12 Market Road",
    shopPhotoKey: `customers/${creatorId}/shop.jpg`,
    ...overrides,
  };
}

// A salesman with an Active GatePass today on a fresh Route.
async function salesmanOnRoute(routeName?: string) {
  const admin = await buildProfile();
  const { profile: salesman } = await buildSalesman();
  const route = await buildRoute(routeName ? { name: routeName } : {});
  const gatepass = await buildGatepass({
    salesmanId: salesman.id,
    issuedBy: admin.id,
    routeId: route.id,
    businessDate: today,
    lines: [],
  });
  return { admin, salesman, route, gatepass };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 11:30 IST on 25 Oct 2026.
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CustomerService Admin add", () => {
  it("saves the Customer on the picked Route and records the add", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();

    const customer = await customerService.createCustomerAsAdmin(
      { ...shopDetails(admin.id), routeId: route.id },
      admin.id,
    );

    expect(customer).toMatchObject({
      routeId: route.id,
      createdBy: admin.id,
      gstin: null,
      einvoicingRequired: false,
      preferredLanguage: "mr",
    });
    const rows = await listAuditLogsForEntity("customer", customer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "created",
      actorId: admin.id,
      customerId: customer.id,
    });
    expect(rows[0]?.payload).toMatchObject({ shopName: "Ganesh Stores", routeId: route.id });
  });

  it("refuses a hidden Route", async () => {
    const admin = await buildProfile();
    const hidden = await buildRoute({ name: "Hidden Route", deletedAt: new Date() });

    await expect(
      customerService.createCustomerAsAdmin(
        { ...shopDetails(admin.id), routeId: hidden.id },
        admin.id,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows two Customers with the same phone", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();

    await customerService.createCustomerAsAdmin(
      { ...shopDetails(admin.id, { phone: "9000000001" }), routeId: route.id },
      admin.id,
    );
    const second = await customerService.createCustomerAsAdmin(
      {
        ...shopDetails(admin.id, { phone: "9000000001", shopName: "Outlet 2" }),
        routeId: route.id,
      },
      admin.id,
    );

    expect(second.phone).toBe("9000000001");
  });

  it("trims and upper-cases the GSTIN; E-invoicing required stays off", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();

    const withGstin = await customerService.createCustomerAsAdmin(
      { ...shopDetails(admin.id), routeId: route.id, gstin: " 27abcde1234f1z5 " },
      admin.id,
    );
    const emptyGstin = await customerService.createCustomerAsAdmin(
      { ...shopDetails(admin.id), routeId: route.id, gstin: "  " },
      admin.id,
    );

    expect(withGstin).toMatchObject({ gstin: "27ABCDE1234F1Z5", einvoicingRequired: false });
    expect(emptyGstin).toMatchObject({ gstin: null, einvoicingRequired: false });
  });

  it("refuses a GSTIN that is not 15 letters or digits", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();

    for (const gstin of ["27ABCDE1234F1Z", "27ABCDE1234F1Z56", "27ABCDE1234F1Z-"]) {
      await expect(
        customerService.createCustomerAsAdmin(
          { ...shopDetails(admin.id), routeId: route.id, gstin },
          admin.id,
        ),
      ).rejects.toThrow();
    }
  });

  it("accepts Hindi and English as Preferred language and refuses anything else", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();

    const hindi = await customerService.createCustomerAsAdmin(
      { ...shopDetails(admin.id), routeId: route.id, preferredLanguage: "hi" },
      admin.id,
    );
    const english = await customerService.createCustomerAsAdmin(
      { ...shopDetails(admin.id), routeId: route.id, preferredLanguage: "en" },
      admin.id,
    );

    expect([hindi.preferredLanguage, english.preferredLanguage]).toEqual(["hi", "en"]);
    await expect(
      customerService.createCustomerAsAdmin(
        { ...shopDetails(admin.id), routeId: route.id, preferredLanguage: "fr" as never },
        admin.id,
      ),
    ).rejects.toThrow();
  });
});

describe("CustomerService Admin edit", () => {
  it("changes the GSTIN with an audit, never the Preferred language or Route", async () => {
    const admin = await buildProfile();
    const route = await buildRoute();
    const otherRoute = await buildRoute();
    const customer = await buildCustomer(admin.id, { routeId: route.id, preferredLanguage: "hi" });

    const updated = await customerService.updateCustomer(
      customer.id,
      {
        gstin: "27abcde1234f1z5",
        einvoicingRequired: true,
        preferredLanguage: "en",
        routeId: otherRoute.id,
      } as never,
      admin.id,
    );

    expect(updated).toMatchObject({
      gstin: "27ABCDE1234F1Z5",
      einvoicingRequired: false,
      preferredLanguage: "hi",
      routeId: route.id,
    });
    const [row] = await listAuditLogsForEntity("customer", customer.id);
    expect(row?.payload).toEqual({
      gstin: { from: null, to: "27ABCDE1234F1Z5" },
    });
  });

  it("clears the GSTIN with an empty value", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id, { gstin: "27ABCDE1234F1Z5" });

    const updated = await customerService.updateCustomer(customer.id, { gstin: "" }, admin.id);

    expect(updated?.gstin).toBeNull();
  });
});

describe("CustomerService Admin list", () => {
  it("filters by Route and labels a hidden Route", async () => {
    const admin = await buildProfile();
    const listed = await buildRoute({ name: "Listed Route" });
    const hidden = await buildRoute({ name: "Gone Route", deletedAt: new Date() });
    await buildCustomer(admin.id, { routeId: listed.id, shopName: "On Listed" });
    await buildCustomer(admin.id, { routeId: hidden.id, shopName: "On Hidden" });

    const page = await customerService.searchCustomers({ routeId: hidden.id });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      shopName: "On Hidden",
      routeId: hidden.id,
      routeName: "Gone Route",
      routeCode: hidden.code,
      routeHidden: true,
    });
  });

  it("searches by name, contact, phone or address", async () => {
    const admin = await buildProfile();
    await buildCustomer(admin.id, {
      shopName: "Laxmi Kirana",
      contactName: "Suresh Patil",
      phone: "9111111111",
      address: "Station Road, Kagal",
    });
    await buildCustomer(admin.id, { shopName: "Other Shop" });

    for (const searchTerm of ["laxmi", "suresh", "91111", "station road"]) {
      const page = await customerService.searchCustomers({ searchTerm });
      expect(page.items.map((customer) => customer.shopName)).toEqual(["Laxmi Kirana"]);
    }
  });
});

describe("CustomerService salesman", () => {
  it("adds a Customer on the Active GatePass Route with Marathi by default", async () => {
    const { salesman, route } = await salesmanOnRoute();

    const customer = await customerService.createCustomerAsSalesman(
      shopDetails(salesman.id),
      salesman.id,
    );
    const hindi = await customerService.createCustomerAsSalesman(
      shopDetails(salesman.id, { preferredLanguage: "hi" }),
      salesman.id,
    );

    expect(customer).toMatchObject({
      routeId: route.id,
      createdBy: salesman.id,
      gstin: null,
      einvoicingRequired: false,
      preferredLanguage: "mr",
    });
    expect(hindi.preferredLanguage).toBe("hi");
  });

  it("refuses add and list with no Active GatePass, including after handover", async () => {
    const { salesman, gatepass } = await salesmanOnRoute();
    const { profile: idleSalesman } = await buildSalesman();

    await expect(
      customerService.createCustomerAsSalesman(shopDetails(idleSalesman.id), idleSalesman.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "No Active GatePass" });
    await expect(
      customerService.searchCustomersForSalesman({}, idleSalesman.id),
    ).rejects.toMatchObject({ message: "No Active GatePass" });

    await db
      .update(gatepassesTable)
      .set({ status: "pending_verification" })
      .where(eq(gatepassesTable.id, gatepass.id));
    await expect(
      customerService.createCustomerAsSalesman(shopDetails(salesman.id), salesman.id),
    ).rejects.toMatchObject({ message: "No Active GatePass" });
  });

  it("does not count an Active GatePass from an earlier date", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      businessDate: "2026-10-24",
      lines: [],
    });

    await expect(customerService.searchCustomersForSalesman({}, salesman.id)).rejects.toMatchObject(
      { message: "No Active GatePass" },
    );
  });

  it("lists only active Customers on the Active GatePass Route and follows the next GatePass", async () => {
    const { admin, salesman, route, gatepass } = await salesmanOnRoute("Kolhapur Line");
    const otherRoute = await buildRoute({ name: "Satara Line" });
    await buildCustomer(admin.id, { routeId: route.id, shopName: "Kolhapur Shop" });
    await buildCustomer(admin.id, {
      routeId: route.id,
      shopName: "Closed Shop",
      status: "inactive",
      deletedAt: new Date(),
    });
    await buildCustomer(admin.id, { routeId: otherRoute.id, shopName: "Satara Shop" });

    const first = await customerService.searchCustomersForSalesman({}, salesman.id);
    expect(first.items.map((customer) => customer.shopName)).toEqual(["Kolhapur Shop"]);
    expect(first.items[0]).toMatchObject({ routeName: "Kolhapur Line", routeCode: route.code });

    await db
      .update(gatepassesTable)
      .set({ status: "closed" })
      .where(eq(gatepassesTable.id, gatepass.id));
    await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      routeId: otherRoute.id,
      businessDate: today,
      lines: [],
    });

    const next = await customerService.searchCustomersForSalesman({}, salesman.id);
    expect(next.items.map((customer) => customer.shopName)).toEqual(["Satara Shop"]);
  });

  it("searches by name, phone or address", async () => {
    const { admin, salesman, route } = await salesmanOnRoute();
    await buildCustomer(admin.id, {
      routeId: route.id,
      shopName: "Laxmi Kirana",
      phone: "9111111111",
      address: "Station Road, Kagal",
    });
    await buildCustomer(admin.id, { routeId: route.id, shopName: "Other Shop" });

    for (const searchTerm of ["laxmi", "91111", "station road"]) {
      const page = await customerService.searchCustomersForSalesman({ searchTerm }, salesman.id);
      expect(page.items.map((customer) => customer.shopName)).toEqual(["Laxmi Kirana"]);
    }
  });

  it("opens a Customer on the Route and says not found off it", async () => {
    const { admin, salesman, route } = await salesmanOnRoute();
    const onRoute = await buildCustomer(admin.id, { routeId: route.id });
    const offRoute = await buildCustomer(admin.id);

    const opened = await customerService.getCustomerForSalesman(onRoute.id, salesman.id);

    expect(opened.id).toBe(onRoute.id);
    await expect(
      customerService.getCustomerForSalesman(offRoute.id, salesman.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("CustomerService Move to Route", () => {
  it("moves the Customer, keeps the Balance and records both Routes", async () => {
    const admin = await buildProfile();
    const from = await buildRoute();
    const to = await buildRoute();
    const customer = await buildCustomer(admin.id, { routeId: from.id, balancePaise: 12_345 });

    const moved = await customerService.moveCustomerToRoute(customer.id, to.id, admin.id);

    expect(moved).toMatchObject({ routeId: to.id, balancePaise: 12_345 });
    const [row] = await listAuditLogsForEntity("customer", customer.id);
    expect(row).toMatchObject({
      action: "moved_route",
      actorId: admin.id,
      customerId: customer.id,
      payload: { fromRouteId: from.id, toRouteId: to.id },
    });
  });

  it("refuses while the Customer has an open Pre-order, with the count", async () => {
    const admin = await buildProfile();
    const to = await buildRoute();
    const customer = await buildCustomer(admin.id, { shopName: "Patil Dairy" });
    const variety = await buildVariety();
    for (let index = 0; index < 2; index += 1) {
      await buildOrder({
        customer,
        actorId: admin.id,
        type: "pre_order",
        lines: [{ variety, quantity: 1, routePricePaise: 1000 }],
      });
    }

    await expect(
      customerService.moveCustomerToRoute(customer.id, to.id, admin.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Patil Dairy has 2 open Pre-orders. Fulfil or cancel them before moving the Customer.",
    });
  });

  it("refuses a hidden Route and the Customer's own Route", async () => {
    const admin = await buildProfile();
    const hidden = await buildRoute({ deletedAt: new Date() });
    const customer = await buildCustomer(admin.id);

    await expect(
      customerService.moveCustomerToRoute(customer.id, hidden.id, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      customerService.moveCustomerToRoute(customer.id, customer.routeId, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const [stored] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customer.id));
    expect(stored?.routeId).toBe(customer.routeId);
  });

  it("drops a moved Customer from the old Route's salesman list at once", async () => {
    const { admin, salesman, route } = await salesmanOnRoute();
    const elsewhere = await buildRoute();
    const customer = await buildCustomer(admin.id, { routeId: route.id });

    await customerService.moveCustomerToRoute(customer.id, elsewhere.id, admin.id);

    const page = await customerService.searchCustomersForSalesman({}, salesman.id);
    expect(page.items).toHaveLength(0);
    await expect(
      customerService.getCustomerForSalesman(customer.id, salesman.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
