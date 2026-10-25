import { describe, expect, it } from "vitest";

import {
  buildBookNowWithBill,
  buildCustomer,
  buildOrder,
  buildProfile,
  buildRoute,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import CustomerService from "../customers";
import OrderService from "./index";

const orderService = new OrderService();
const customerService = new CustomerService();

describe("OrderService reads", () => {
  it("lists an unbilled Pre-order with no Bill and quantity from its lines", async () => {
    const admin = await buildProfile();
    const salesman = await buildSalesman({ salesmanCode: "SM101" });
    const route = await buildRoute({ name: "Kolhapur East", code: "rt-kolhapur-east" });
    const customer = await buildCustomer(admin.id, { routeId: route.id });
    const milk = await buildVariety({ name: "1 L" });
    const curd = await buildVariety({ name: "500 g" });
    await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      salesmanId: salesman.profile.id,
      lines: [
        { variety: milk, quantity: 3, routePricePaise: 5_000 },
        { variety: curd, quantity: 4, routePricePaise: 3_000 },
      ],
    });

    const result = await orderService.listOrders({ customerId: customer.id });

    expect(result.items).toHaveLength(1);
    const [row] = result.items;
    expect(row).toMatchObject({
      type: "pre_order",
      totalQuantity: 7,
      routeName: "Kolhapur East",
      routeCode: "rt-kolhapur-east",
      salesmanCode: "SM101",
      bill: null,
    });
  });

  it("lists a Book Now with its Bill number and total in paise", async () => {
    const admin = await buildProfile();
    const salesman = await buildSalesman();
    const customer = await buildCustomer(admin.id);
    const milk = await buildVariety();
    const { bill } = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      salesmanId: salesman.profile.id,
      lines: [{ variety: milk, quantity: 2, routePricePaise: 10_000 }],
    });

    const result = await orderService.listOrders({ customerId: customer.id });

    expect(result.items[0]?.bill).toEqual({
      id: bill.id,
      number: bill.number,
      totalPaise: 21_000,
    });
  });

  it("filters by type and Customer phone", async () => {
    const admin = await buildProfile();
    const first = await buildCustomer(admin.id, { phone: "9811100001" });
    const second = await buildCustomer(admin.id, { phone: "9811100002" });
    const variety = await buildVariety();
    const line = { variety, quantity: 1, routePricePaise: 1_000 };
    await buildOrder({ customer: first, actorId: admin.id, type: "pre_order", lines: [line] });
    await buildOrder({ customer: first, actorId: admin.id, type: "book_now", lines: [line] });
    await buildOrder({ customer: second, actorId: admin.id, type: "pre_order", lines: [line] });

    const result = await orderService.listOrders({
      type: "pre_order",
      customerPhone: "9811100001",
    });

    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.customerShopName).toBe(first.shopName);
  });

  it("lists and opens an order with no salesman, showing the locked line terms", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const milk = await buildVariety({ name: "1 L", unit: "pouch" });
    const { order, bill } = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      salesmanId: null,
      lines: [{ variety: milk, quantity: 2, routePricePaise: 4_500, gstRateBps: 500, hsn: "0401" }],
    });

    const listed = await orderService.listOrders({ customerId: customer.id });
    const detail = await orderService.getOrderDetail(order.id);

    expect(listed.items[0]).toMatchObject({ salesmanCode: null, salesmanName: null });
    expect(detail.salesmanCode).toBeNull();
    expect(detail.bill?.number).toBe(bill.number);
    expect(detail.items).toEqual([
      expect.objectContaining({
        varietyId: milk.id,
        stamp: { name: "1 L", unit: "pouch", hsn: "0401" },
        quantity: 2,
        routePricePaise: 4_500,
        exempt: false,
        gstRateBps: 500,
      }),
    ]);
  });

  it("lists a Customer's open orders with quantity from lines", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      scheduledDate: "2026-10-30",
      lines: [{ variety, quantity: 6, routePricePaise: 1_000 }],
    });
    await buildOrder({
      customer,
      actorId: admin.id,
      type: "pre_order",
      status: "cancelled",
      lines: [{ variety, quantity: 1, routePricePaise: 1_000 }],
    });

    const openOrders = await customerService.listOpenOrders(customer.id);

    expect(openOrders).toEqual([
      expect.objectContaining({
        type: "pre_order",
        status: "scheduled",
        scheduledDate: "2026-10-30",
        totalQuantity: 6,
      }),
    ]);
  });
});
