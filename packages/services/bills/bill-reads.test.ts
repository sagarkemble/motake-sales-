import { describe, expect, it } from "vitest";

import {
  buildBill,
  buildBookNowWithBill,
  buildCustomer,
  buildProfile,
  buildRoute,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import BillService from "./index";

const billService = new BillService();

describe("BillService reads", () => {
  it("opens a Bill by id with paise totals, letterhead and lines", async () => {
    const admin = await buildProfile();
    const route = await buildRoute({ name: "Sangli West", code: "rt-sangli-west" });
    const customer = await buildCustomer(admin.id, { routeId: route.id, shopName: "Laxmi Dairy" });
    const milk = await buildVariety({ name: "1 L" });
    const { order, bill } = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      billDate: "2026-10-20",
      lines: [{ variety: milk, quantity: 3, routePricePaise: 5_000, hsn: "0401" }],
    });

    const opened = await billService.getBill(bill.id);

    expect(opened).toMatchObject({
      id: bill.id,
      orderId: order.id,
      customerId: customer.id,
      number: bill.number,
      legalType: "tax_invoice",
      billDate: "2026-10-20",
      totalQuantity: 3,
      totalPaise: 15_750,
      taxablePaise: 15_000,
      cgstPaise: 375,
      sgstPaise: 375,
      igstPaise: 0,
      roundOffPaise: 0,
      cancelled: false,
      letterhead: {
        route: { name: "Sangli West", code: "rt-sangli-west", delivery_state: "Maharashtra" },
        buyer: { shop_name: "Laxmi Dairy" },
      },
    });
    expect(opened.items).toEqual([
      expect.objectContaining({
        varietyId: milk.id,
        stamp: { name: "1 L", unit: "", hsn: "0401" },
        quantity: 3,
        routePricePaise: 5_000,
        exempt: false,
        gstRateBps: 500,
        taxablePaise: 15_000,
        cgstPaise: 375,
        sgstPaise: 375,
        igstPaise: 0,
      }),
    ]);
  });

  it("finds a Bill by its number and by its order", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const { order, bill } = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      lines: [{ variety, quantity: 1, routePricePaise: 2_000 }],
    });

    const byNumber = await billService.getBillByNumber(bill.number);
    const forOrder = await billService.getBillForOrder(order.id);

    expect(byNumber.id).toBe(bill.id);
    expect(forOrder?.id).toBe(bill.id);
  });

  it("resolves an office Bill's Customer through its Ledger Bill debit", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const { bill } = await buildBill({
      customer,
      actorId: admin.id,
      orderId: null,
      lines: [{ variety, quantity: 2, routePricePaise: 1_000, exempt: true }],
    });

    const opened = await billService.getBill(bill.id);

    expect(opened).toMatchObject({
      orderId: null,
      customerId: customer.id,
      legalType: "bill_of_supply",
      totalPaise: 2_000,
    });
  });

  it("marks a Bill cancelled once Bill Cancel wrote its marker", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const { bill } = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      status: "cancelled",
      lines: [{ variety, quantity: 1, routePricePaise: 1_000 }],
    });

    const opened = await billService.getBill(bill.id);

    expect(opened.cancelled).toBe(true);
  });

  it("lists Bills newest first, filtered by Customer, salesman, date and number", async () => {
    const admin = await buildProfile();
    const salesman = await buildSalesman();
    const customer = await buildCustomer(admin.id);
    const otherCustomer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const line = { variety, quantity: 1, routePricePaise: 1_000 };
    const older = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      salesmanId: salesman.profile.id,
      billDate: "2026-10-01",
      lines: [line],
    });
    const newer = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      billDate: "2026-10-10",
      lines: [line],
    });
    await buildBookNowWithBill({ customer: otherCustomer, actorId: admin.id, lines: [line] });

    const forCustomer = await billService.listBills({ customerId: customer.id });
    const forSalesman = await billService.listBills({ salesmanId: salesman.profile.id });
    const inRange = await billService.listBills({
      customerId: customer.id,
      billDateFrom: "2026-10-05",
      billDateTo: "2026-10-31",
    });
    const byNumber = await billService.listBills({ numberSearch: older.bill.number.slice(-6) });

    expect(forCustomer.items.map((row) => row.id)).toEqual([newer.bill.id, older.bill.id]);
    expect(forCustomer.items[0]).toMatchObject({
      customerId: customer.id,
      customerShopName: customer.shopName,
    });
    expect(forSalesman.items.map((row) => row.id)).toEqual([older.bill.id]);
    expect(inRange.items.map((row) => row.id)).toEqual([newer.bill.id]);
    expect(byNumber.items.map((row) => row.id)).toEqual([older.bill.id]);
  });

  it("leaves cancelled Bills out of the list when asked to", async () => {
    const admin = await buildProfile();
    const customer = await buildCustomer(admin.id);
    const variety = await buildVariety();
    const line = { variety, quantity: 1, routePricePaise: 1_000 };
    const kept = await buildBookNowWithBill({ customer, actorId: admin.id, lines: [line] });
    const cancelled = await buildBookNowWithBill({
      customer,
      actorId: admin.id,
      status: "cancelled",
      lines: [line],
    });

    const all = await billService.listBills({ customerId: customer.id });
    const withoutCancelled = await billService.listBills({
      customerId: customer.id,
      hideCancelled: true,
    });

    expect(all.items.map((row) => row.id).sort()).toEqual([kept.bill.id, cancelled.bill.id].sort());
    expect(withoutCancelled.items.map((row) => row.id)).toEqual([kept.bill.id]);
    expect(withoutCancelled.totalCount).toBe(1);
  });
});
