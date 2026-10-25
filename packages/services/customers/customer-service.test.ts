import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { describe, expect, it } from "vitest";

import { buildCustomer, buildProfile } from "../test/builders";
import CustomerService from "./index";

const customerService = new CustomerService();

describe("CustomerService upkeep", () => {
  it("lets a Customer take a phone another Customer already uses", async () => {
    const admin = await buildProfile();
    const firstOutlet = await buildCustomer(admin.id, { phone: "9876500001" });
    const secondOutlet = await buildCustomer(admin.id, { phone: "9876500002" });

    const updated = await customerService.updateCustomer(
      secondOutlet.id,
      { phone: firstOutlet.phone },
      admin.id,
    );

    expect(updated?.phone).toBe("9876500001");
  });

  it("reactivates a Customer even when an active Customer has the same phone", async () => {
    const admin = await buildProfile();
    await buildCustomer(admin.id, { phone: "9876500003" });
    const inactiveOutlet = await buildCustomer(admin.id, { phone: "9876500003" });
    await customerService.deactivateCustomer(inactiveOutlet.id, admin.id);

    const reactivated = await customerService.reactivateCustomer(inactiveOutlet.id, admin.id);

    expect(reactivated.status).toBe("active");
  });

  it("finds every Customer sharing a phone", async () => {
    const admin = await buildProfile();
    await buildCustomer(admin.id, { phone: "9876500004", shopName: "Outlet A" });
    await buildCustomer(admin.id, { phone: "9876500004", shopName: "Outlet B" });

    const result = await customerService.searchCustomers({ searchTerm: "9876500004" });

    expect(result.items.map((customer) => customer.shopName).sort()).toEqual([
      "Outlet A",
      "Outlet B",
    ]);
  });

  it("records edit, deactivate and reactivate against the Customer", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id, { shopName: "Ganesh Stores" });

    await customerService.updateCustomer(
      customer.id,
      { shopName: "Shree Ganesh Stores" },
      admin.id,
    );
    await customerService.deactivateCustomer(customer.id, admin.id);
    await customerService.reactivateCustomer(customer.id, admin.id);

    const rows = await listAuditLogsForEntity("customer", customer.id);
    expect(rows.map((row) => row.action).sort()).toEqual(["activated", "deactivated", "updated"]);
    expect(rows.every((row) => row.customerId === customer.id && row.actorId === admin.id)).toBe(
      true,
    );
    expect(rows.find((row) => row.action === "updated")?.payload).toEqual({
      shopName: { from: "Ganesh Stores", to: "Shree Ganesh Stores" },
    });
  });
});
