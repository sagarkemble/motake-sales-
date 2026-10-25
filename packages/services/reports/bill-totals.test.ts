import { describe, expect, it } from "vitest";

import CustomerService from "../customers";
import SalesmanService from "../salesman";
import {
  buildBill,
  buildBookNowWithBill,
  buildCustomer,
  buildOrder,
  buildProfile,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import ReportService from "./index";

const reportService = new ReportService();
const salesmanService = new SalesmanService();
const customerService = new CustomerService();

// Each test uses its own dates: rows from earlier tests in this file are not wiped.
function istDay(businessDate: string) {
  return {
    from: new Date(`${businessDate}T00:00:00+05:30`),
    to: new Date(`${businessDate}T23:59:59.999+05:30`),
  };
}

describe("Reports total Bills, never orders", () => {
  it("daily sales value sums that day's Bill totals and leaves out cancelled orders' Bills", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const day = istDay("2026-09-01");
    const placedAt = new Date("2026-09-01T05:00:00Z");
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      billDate: "2026-09-01",
      placedAt,
      lines: [{ variety, quantity: 2, routePricePaise: 10_000 }],
    });
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      status: "cancelled",
      billDate: "2026-09-01",
      placedAt,
      lines: [{ variety, quantity: 5, routePricePaise: 10_000 }],
    });
    await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      placedAt,
      lines: [{ variety, quantity: 9, routePricePaise: 10_000 }],
    });

    const kpi = await reportService.getDailyKpiSummary({
      businessDate: "2026-09-01",
      placedFrom: day.from,
      placedTo: day.to,
    });

    expect(kpi).toMatchObject({ bookNowOrderCount: 2, preOrderCount: 1, salesValuePaise: 21_000 });
  });

  it("product-wise sales total quantity and tax from Bill lines by Bill date", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const milk = await buildVariety({ name: "Milk 1 L" });
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      billDate: "2026-09-02",
      lines: [{ variety: milk, quantity: 2, routePricePaise: 10_000 }],
    });
    await buildBill({
      customer,
      actorId: admin.id,
      billDate: "2026-09-02",
      lines: [{ variety: milk, quantity: 1, routePricePaise: 10_000 }],
    });
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      status: "cancelled",
      billDate: "2026-09-02",
      lines: [{ variety: milk, quantity: 7, routePricePaise: 10_000 }],
    });

    const rows = await reportService.getProductWiseSalesSummary(istDay("2026-09-02"));

    expect(rows).toEqual([
      expect.objectContaining({
        varietyId: milk.id,
        varietyName: "Milk 1 L",
        totalQuantitySold: 3,
        taxablePaise: 30_000,
        taxPaise: 1_500,
      }),
    ]);
  });

  it("monthly volume counts orders with no salesman in the total only", async () => {
    const admin = await buildProfile();
    const salesman = await buildSalesman();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const placedAt = new Date("2026-08-10T05:00:00Z");
    const line = { variety, quantity: 1, routePricePaise: 1_000 };
    await buildOrder({
      customer,
      actorId: admin.id,
      salesmanId: salesman.profile.id,
      placedAt,
      lines: [line],
    });
    await buildOrder({ customer, actorId: admin.id, salesmanId: null, placedAt, lines: [line] });

    const volume = await reportService.getMonthlyOrderVolume({
      from: new Date("2026-08-01T00:00:00+05:30"),
      to: new Date("2026-08-31T23:59:59+05:30"),
    });

    expect(volume.totalOrderCount).toBe(2);
    expect(volume.perSalesman).toEqual([
      { salesmanId: salesman.profile.id, salesmanCode: salesman.salesmanCode, orderCount: 1 },
    ]);
  });

  it("salesman day-wise history shows sold value from Bills and Pre-ordered quantity", async () => {
    const admin = await buildProfile();
    const salesman = await buildSalesman();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const placedAt = new Date("2026-09-03T05:00:00Z");
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      salesmanId: salesman.profile.id,
      billDate: "2026-09-03",
      placedAt,
      lines: [{ variety, quantity: 2, routePricePaise: 10_000 }],
    });
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      salesmanId: salesman.profile.id,
      status: "cancelled",
      billDate: "2026-09-03",
      placedAt,
      lines: [{ variety, quantity: 4, routePricePaise: 10_000 }],
    });
    await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      salesmanId: salesman.profile.id,
      placedAt,
      lines: [{ variety, quantity: 6, routePricePaise: 10_000 }],
    });

    const history = await salesmanService.getDayWiseHistory(salesman.profile.id, {
      from: "2026-09-03",
      to: "2026-09-03",
    });

    expect(history).toEqual([
      expect.objectContaining({
        businessDate: "2026-09-03",
        soldAmountPaise: 21_000,
        preOrderedQty: 6,
      }),
    ]);
    expect(history[0]).not.toHaveProperty("preOrderedAmount");
  });

  it("Customer lifetime value sums that Customer's Bills, office Bills included", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      placedAt: new Date("2026-09-04T05:00:00Z"),
      lines: [{ variety, quantity: 2, routePricePaise: 10_000 }],
    });
    await buildBill({
      customer,
      actorId: admin.id,
      orderId: null,
      lines: [{ variety, quantity: 1, routePricePaise: 5_000, exempt: true }],
    });
    await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      status: "cancelled",
      lines: [{ variety, quantity: 9, routePricePaise: 10_000 }],
    });
    await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      placedAt: new Date("2026-09-05T05:00:00Z"),
      lines: [{ variety, quantity: 3, routePricePaise: 10_000 }],
    });

    const stats = await customerService.getCustomerStats(customer.id);

    expect(stats).toEqual({
      totalOrderCount: 2,
      billedQuantity: 3,
      lifetimeValuePaise: 26_000,
      lastOrderAt: new Date("2026-09-05T05:00:00Z"),
    });
  });
});
