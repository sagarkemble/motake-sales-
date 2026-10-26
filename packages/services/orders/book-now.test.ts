import { randomUUID } from "node:crypto";

import { asc, db, eq, sql } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import {
  billItemsTable,
  billsTable,
  billVersionsTable,
  customersTable,
  documentNumberSeriesTable,
  gatepassItemsTable,
  gatepassesTable,
  ledgerEntriesTable,
  orderItemsTable,
  ordersTable,
  orderVersionsTable,
  paymentEventsTable,
  paymentsTable,
  productsTable,
  productVarietiesTable,
  routePricesTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkoutRefusalOf } from "../errors";
import LedgerService from "../ledger";
import type { CheckoutOutcome } from "../shared/checkout-events";
import {
  buildCheckoutWorld,
  buildPayment,
  buildProfile,
  buildRoute,
  buildVariety,
  buildVarietyTaxPeriod,
  type CheckoutWorld,
} from "../test/builders";
import { waitForLockWaiter, wipeApplicationTables } from "../test/database";
import OrderService, { type PlaceBookNowInput } from "./index";

const orderService = new OrderService();
const ledger = new LedgerService();
const today = "2026-10-25";

// Every test counts rows and numbers from an empty database.
beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  // 11:30 IST on 25 Oct 2026.
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function bookNowInput(
  world: CheckoutWorld,
  overrides: Partial<PlaceBookNowInput> = {},
): PlaceBookNowInput {
  return {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    lines: [
      { sku: world.milk.sku, qty: 3 },
      { sku: world.curd.sku, qty: 1 },
    ],
    payment: { mode: "cash", receivedPaise: 0 },
    ...overrides,
  };
}

// The refusal reason and details a call was refused with.
async function refusalOf(call: Promise<unknown>) {
  const error = await call.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!error) throw new Error("Expected the call to be refused");
  const refusal = checkoutRefusalOf(error);
  if (!refusal) throw error;
  return refusal;
}

async function countRows() {
  const count = async (
    table:
      | typeof ordersTable
      | typeof billsTable
      | typeof ledgerEntriesTable
      | typeof paymentsTable,
  ) => Number((await db.select({ total: sql<number>`count(*)` }).from(table))[0]!.total);
  return {
    orders: await count(ordersTable),
    bills: await count(billsTable),
    ledger: await count(ledgerEntriesTable),
    payments: await count(paymentsTable),
  };
}

async function seriesNextSeq(kind: "bill" | "payment", financialYear = "26-27") {
  const [row] = await db
    .select({ nextSeq: documentNumberSeriesTable.nextSeq })
    .from(documentNumberSeriesTable)
    .where(
      sql`${documentNumberSeriesTable.kind} = ${kind} AND ${documentNumberSeriesTable.financialYear} = ${financialYear}`,
    );
  return row?.nextSeq ?? 1;
}

async function soldQty(gatepassId: string) {
  const rows = await db
    .select({ varietyId: gatepassItemsTable.varietyId, soldQty: gatepassItemsTable.soldQty })
    .from(gatepassItemsTable)
    .where(eq(gatepassItemsTable.gatepassId, gatepassId));
  return new Map(rows.map((row) => [row.varietyId, row.soldQty]));
}

async function balanceOf(customerId: string) {
  return (await ledger.getBalance(customerId)).balancePaise;
}

async function ledgerOf(customerId: string) {
  return db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId))
    .orderBy(asc(ledgerEntriesTable.occurredAt));
}

describe("OrderService.placeBookNow", () => {
  it("writes the order, Bill, v1 versions, stock and Ledger once with correct links", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, { notes: " Leave at gate " }),
    );

    // 3 × ₹24.99 at 5% intra (₹1.87 + ₹1.87) + ₹40 exempt = ₹118.71 → ₹119.00.
    expect(result).toEqual({
      orderId: expect.any(String),
      billId: expect.any(String),
      billNumber: "MB/26-27/000001",
      billTotalPaise: 11_900,
      balanceAfterBillPaise: 11_900,
      payment: null,
      returnedPaise: 0,
      balancePaise: 11_900,
    });

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, result.orderId));
    expect(order).toMatchObject({
      type: "book_now",
      status: "confirmed",
      salesmanId: world.salesman.id,
      customerId: world.customer.id,
      routeId: world.route.id,
      gatepassId: world.gatepass.id,
      notes: "Leave at gate",
    });
    const orderItems = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, result.orderId));
    expect(orderItems).toHaveLength(2);
    const milkItem = orderItems.find((item) => item.varietyId === world.milk.id)!;
    expect(milkItem).toMatchObject({
      stamp: { name: "Milk 1 L", unit: "pack", hsn: "0401" },
      quantity: 3,
      routePricePaise: 2_499,
      exempt: false,
      gstRateBps: 500,
    });
    const curdItem = orderItems.find((item) => item.varietyId === world.curd.id)!;
    expect(curdItem).toMatchObject({ exempt: true, gstRateBps: 0, routePricePaise: 4_000 });

    const orderVersions = await db
      .select()
      .from(orderVersionsTable)
      .where(eq(orderVersionsTable.orderId, result.orderId));
    expect(orderVersions).toHaveLength(1);
    expect(orderVersions[0]).toMatchObject({
      versionNumber: 1,
      reason: "Placed",
      actorId: world.salesman.id,
      header: {
        id: result.orderId,
        route: {
          name: world.route.name,
          code: world.route.code,
          delivery_state: "Maharashtra",
        },
      },
    });
    expect((orderVersions[0]!.items as { id: string }[]).map((item) => item.id).sort()).toEqual(
      orderItems.map((item) => item.id).sort(),
    );

    const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, result.billId));
    expect(bill).toMatchObject({
      orderId: result.orderId,
      number: "MB/26-27/000001",
      legalType: "tax_invoice",
      totalQuantity: 4,
      taxablePaise: 11_497,
      cgstPaise: 187,
      sgstPaise: 187,
      igstPaise: 0,
      roundOffPaise: 29,
      totalPaise: 11_900,
      billDate: today,
      letterhead: {
        route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
        buyer: {
          shop_name: world.customer.shopName,
          phone: world.customer.phone,
          address: world.customer.address,
          gstin: null,
        },
        seller: {
          legal_name: "Motake Test Foods Pvt Ltd",
          address: "1 Test Road, Kolhapur",
          gstin: "27AAAAA0000A1Z5",
        },
      },
    });
    const billItems = await db
      .select()
      .from(billItemsTable)
      .where(eq(billItemsTable.billId, result.billId));
    expect(billItems.find((item) => item.varietyId === world.milk.id)).toMatchObject({
      orderItemId: milkItem.id,
      stamp: { name: "Milk 1 L", unit: "pack", hsn: "0401" },
      taxablePaise: 7_497,
      cgstPaise: 187,
      sgstPaise: 187,
      igstPaise: 0,
    });
    expect(billItems.find((item) => item.varietyId === world.curd.id)).toMatchObject({
      orderItemId: curdItem.id,
      taxablePaise: 4_000,
      cgstPaise: 0,
    });
    const billVersions = await db
      .select()
      .from(billVersionsTable)
      .where(eq(billVersionsTable.billId, result.billId));
    expect(billVersions).toHaveLength(1);
    expect(billVersions[0]).toMatchObject({
      versionNumber: 1,
      reason: "Raised",
      pdfKey: null,
      header: { id: result.billId, number: "MB/26-27/000001" },
    });
    expect((billVersions[0]!.items as { id: string }[]).map((item) => item.id).sort()).toEqual(
      billItems.map((item) => item.id).sort(),
    );

    const ledgerRows = await ledgerOf(world.customer.id);
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({
      entryType: "bill",
      side: "debit",
      amountPaise: 11_900,
      billId: result.billId,
      gatepassId: world.gatepass.id,
      actorId: world.salesman.id,
      reason: null,
    });
    expect(await balanceOf(world.customer.id)).toBe(11_900);

    const sold = await soldQty(world.gatepass.id);
    expect(sold.get(world.milk.id)).toBe(3);
    expect(sold.get(world.curd.id)).toBe(1);
    expect(await countRows()).toMatchObject({ payments: 0 });
  });

  it("merges the same SKU added twice into one line", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, {
        lines: [
          { sku: world.milk.sku, qty: 2 },
          { sku: world.milk.sku, qty: 3 },
        ],
      }),
    );

    const orderItems = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, result.orderId));
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0]!.quantity).toBe(5);
    expect((await soldQty(world.gatepass.id)).get(world.milk.id)).toBe(5);
  });

  it("numbers Bills in the Bill date's financial year", async () => {
    vi.setSystemTime(new Date("2027-04-01T03:00:00Z"));
    const world = await buildCheckoutWorld({ businessDate: "2027-04-01" });

    const result = await orderService.placeBookNow(world.salesman.id, bookNowInput(world));

    expect(result.billNumber).toBe("MB/27-28/000001");
  });

  describe("refuses the whole call, writing nothing and allocating no number", () => {
    async function expectNothingWritten(world: CheckoutWorld) {
      expect(await countRows()).toEqual({ orders: 0, bills: 0, ledger: 0, payments: 0 });
      expect(await seriesNextSeq("bill")).toBe(1);
      const sold = await soldQty(world.gatepass.id);
      expect([...sold.values()].every((qty) => qty === 0)).toBe(true);
    }

    it("with no Active GatePass, or a handed-over or closed one", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      for (const status of ["pending_verification", "closed"] as const) {
        await db
          .update(gatepassesTable)
          .set({ status })
          .where(eq(gatepassesTable.id, world.gatepass.id));
        expect(
          await refusalOf(orderService.placeBookNow(world.salesman.id, bookNowInput(world))),
        ).toMatchObject({ reason: "no_active_gatepass" });
      }
      // Yesterday's Active GatePass is not today's.
      await db
        .update(gatepassesTable)
        .set({ status: "active", businessDate: "2026-10-24" })
        .where(eq(gatepassesTable.id, world.gatepass.id));
      expect(
        await refusalOf(orderService.placeBookNow(world.salesman.id, bookNowInput(world))),
      ).toMatchObject({ reason: "no_active_gatepass" });
      await expectNothingWritten(world);
    });

    it("for a Customer off the GatePass Route or inactive", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const otherRoute = await buildRoute();
      await db
        .update(customersTable)
        .set({ routeId: otherRoute.id })
        .where(eq(customersTable.id, world.customer.id));
      expect(
        await refusalOf(orderService.placeBookNow(world.salesman.id, bookNowInput(world))),
      ).toMatchObject({ reason: "customer_not_on_route" });

      await db
        .update(customersTable)
        .set({ routeId: world.route.id, status: "inactive", deletedAt: new Date() })
        .where(eq(customersTable.id, world.customer.id));
      expect(
        await refusalOf(orderService.placeBookNow(world.salesman.id, bookNowInput(world))),
      ).toMatchObject({ reason: "customer_inactive" });
      await expectNothingWritten(world);
    });

    it("for an empty basket", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      expect(
        await refusalOf(
          orderService.placeBookNow(world.salesman.id, bookNowInput(world, { lines: [] })),
        ),
      ).toMatchObject({ reason: "empty_basket" });
      await expectNothingWritten(world);
    });

    it("listing every bad line: qty 0, unknown SKU, no Route price, no tax period", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const unpriced = await buildVariety({ name: "Paneer 200 g" });
      await buildVarietyTaxPeriod(unpriced.id);
      const untaxed = await buildVariety({ name: "Ghee 1 L" });
      await db
        .insert(routePricesTable)
        .values({ routeId: world.route.id, varietyId: untaxed.id, pricePaise: 50_000 });
      // A tax period that starts tomorrow does not cover today.
      await buildVarietyTaxPeriod(untaxed.id, { effectiveFrom: "2026-10-26" });

      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            lines: [
              { sku: world.milk.sku, qty: 0 },
              { sku: world.curd.sku, qty: 1.5 },
              { sku: "vr-nothing-001", qty: 1 },
              { sku: unpriced.sku, qty: 1 },
              { sku: untaxed.sku, qty: 1 },
            ],
          }),
        ),
      );

      expect(refusal.reason).toBe("bad_lines");
      expect((refusal.details!.lines as unknown[]).length).toBe(5);
      expect(refusal.details!.lines).toEqual(
        expect.arrayContaining([
          { sku: world.milk.sku, reason: "bad_qty" },
          { sku: world.curd.sku, reason: "bad_qty" },
          { sku: "vr-nothing-001", reason: "unknown_sku" },
          { sku: unpriced.sku, reason: "no_route_price" },
          { sku: untaxed.sku, reason: "no_tax_period" },
        ]),
      );
      await expectNothingWritten(world);
    });

    it("for a qty over int4, also when it is reached by merging a repeated SKU", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            lines: [
              { sku: world.milk.sku, qty: 1_500_000_000 },
              { sku: world.milk.sku, qty: 1_500_000_000 },
              { sku: world.curd.sku, qty: 3_000_000_000 },
            ],
          }),
        ),
      );
      expect(refusal.reason).toBe("bad_lines");
      expect(refusal.details!.lines).toEqual(
        expect.arrayContaining([
          { sku: world.milk.sku, reason: "bad_qty" },
          { sku: world.curd.sku, reason: "bad_qty" },
        ]),
      );
      expect((refusal.details!.lines as unknown[]).length).toBe(2);
      await expectNothingWritten(world);
    });

    it("for a basket whose total qty would not fit int4, with no business cap below that", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            lines: [
              { sku: world.milk.sku, qty: 2_000_000_000 },
              { sku: world.curd.sku, qty: 2_000_000_000 },
            ],
          }),
        ),
      );
      expect(refusal.reason).toBe("bad_lines");
      // The first line fits; the second would take the basket past int4.
      expect(refusal.details!.lines).toHaveLength(1);
      await expectNothingWritten(world);

      // A large qty that fits is not refused for its size, only for the stock on the GatePass.
      expect(
        await refusalOf(
          orderService.placeBookNow(
            world.salesman.id,
            bookNowInput(world, { lines: [{ sku: world.milk.sku, qty: 500_000 }] }),
          ),
        ),
      ).toMatchObject({ reason: "short_stock" });
    });

    it("for a Route price × qty too large to bill", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await db
        .update(routePricesTable)
        .set({ pricePaise: Number.MAX_SAFE_INTEGER })
        .where(eq(routePricesTable.varietyId, world.milk.id));
      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, { lines: [{ sku: world.milk.sku, qty: 1 }] }),
        ),
      );
      expect(refusal).toEqual({
        reason: "bad_lines",
        details: { lines: [{ sku: world.milk.sku, reason: "bad_qty" }] },
      });
      await expectNothingWritten(world);
    });

    it("as unknown SKUs for an inactive or deleted Variety or Product", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const priced = async (name: string, productId?: string) => {
        const variety = await buildVariety({ name, ...(productId ? { productId } : {}) });
        await buildVarietyTaxPeriod(variety.id);
        await db
          .insert(routePricesTable)
          .values({ routeId: world.route.id, varietyId: variety.id, pricePaise: 1_000 });
        await db
          .insert(gatepassItemsTable)
          .values({ gatepassId: world.gatepass.id, varietyId: variety.id, issuedQty: 5 });
        return variety;
      };
      const inactiveVariety = await priced("Buttermilk 200 ml");
      const deletedVariety = await priced("Lassi 200 ml");
      const inactiveProductVariety = await priced("Shrikhand 250 g");
      const deletedProductVariety = await priced("Basundi 250 g");
      await db
        .update(productVarietiesTable)
        .set({ status: "inactive" })
        .where(eq(productVarietiesTable.id, inactiveVariety.id));
      await db
        .update(productVarietiesTable)
        .set({ deletedAt: new Date() })
        .where(eq(productVarietiesTable.id, deletedVariety.id));
      await db
        .update(productsTable)
        .set({ status: "inactive" })
        .where(eq(productsTable.id, inactiveProductVariety.productId));
      await db
        .update(productsTable)
        .set({ deletedAt: new Date() })
        .where(eq(productsTable.id, deletedProductVariety.productId));

      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            lines: [
              inactiveVariety,
              deletedVariety,
              inactiveProductVariety,
              deletedProductVariety,
            ].map((variety) => ({ sku: variety.sku, qty: 1 })),
          }),
        ),
      );
      expect(refusal.reason).toBe("bad_lines");
      expect(refusal.details!.lines).toEqual(
        expect.arrayContaining(
          [inactiveVariety, deletedVariety, inactiveProductVariety, deletedProductVariety].map(
            (variety) => ({ sku: variety.sku, reason: "unknown_sku" }),
          ),
        ),
      );
      expect((refusal.details!.lines as unknown[]).length).toBe(4);
      await expectNothingWritten(world);
    });

    it("for a basket that rounds to ₹0", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const toffee = await buildVariety({ name: "Toffee" });
      await buildVarietyTaxPeriod(toffee.id, { exempt: true, gstRateBps: 0 });
      await db
        .insert(routePricesTable)
        .values({ routeId: world.route.id, varietyId: toffee.id, pricePaise: 1 });
      await db
        .insert(gatepassItemsTable)
        .values({ gatepassId: world.gatepass.id, varietyId: toffee.id, issuedQty: 5 });

      // ₹0.01 exempt rounds half-up to ₹0.
      expect(
        await refusalOf(
          orderService.placeBookNow(
            world.salesman.id,
            bookNowInput(world, { lines: [{ sku: toffee.sku, qty: 1 }] }),
          ),
        ),
      ).toEqual({ reason: "bill_total_zero", details: null });
      await expectNothingWritten(world);
    });

    it("for a price field sent on a line", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            lines: [{ sku: world.milk.sku, qty: 1, routePricePaise: 1 }],
          }),
        ),
      );
      expect(refusal).toEqual({
        reason: "price_field_refused",
        details: { fields: [{ sku: world.milk.sku, field: "routePricePaise" }] },
      });
      await expectNothingWritten(world);
    });

    it("for short stock, listing every short line with need and left", async () => {
      const world = await buildCheckoutWorld({
        businessDate: today,
        milkIssuedQty: 2,
        curdIssuedQty: 10,
      });
      const notAllotted = await buildVariety({ name: "Lassi 200 ml" });
      await buildVarietyTaxPeriod(notAllotted.id);
      await db
        .insert(routePricesTable)
        .values({ routeId: world.route.id, varietyId: notAllotted.id, pricePaise: 1_500 });

      const refusal = await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            lines: [
              { sku: world.milk.sku, qty: 3 },
              { sku: world.curd.sku, qty: 4 },
              { sku: notAllotted.sku, qty: 1 },
            ],
          }),
        ),
      );

      expect(refusal.reason).toBe("short_stock");
      expect(refusal.details!.lines).toEqual(
        expect.arrayContaining([
          { sku: world.milk.sku, name: "Milk 1 L", needQty: 3, leftQty: 2 },
          { sku: notAllotted.sku, name: "Lassi 200 ml", needQty: 1, leftQty: 0 },
        ]),
      );
      expect((refusal.details!.lines as unknown[]).length).toBe(2);
      await expectNothingWritten(world);
    });

    it("with no seller master", async () => {
      const world = await buildCheckoutWorld({ businessDate: today, withSeller: false });
      expect(
        await refusalOf(orderService.placeBookNow(world.salesman.id, bookNowInput(world))),
      ).toMatchObject({ reason: "seller_master_missing" });
      await expectNothingWritten(world);
    });
  });
});

describe("OrderService.placeBookNow checkout Payment", () => {
  async function paymentsOf(customerId: string) {
    return db.select().from(paymentsTable).where(eq(paymentsTable.customerId, customerId));
  }

  it("takes no Payment, MP or posted event when ₹0 is received", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const result = await orderService.placeBookNow(world.salesman.id, bookNowInput(world));
    expect(result.payment).toBeNull();
    expect(await paymentsOf(world.customer.id)).toHaveLength(0);
    expect(await db.select().from(paymentEventsTable)).toHaveLength(0);
    expect(await seriesNextSeq("payment")).toBe(1);
  });

  it("records a partial cash Payment after the Bill debit, with its posted event", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, { payment: { mode: "cash", receivedPaise: 5_000 } }),
    );

    expect(result).toMatchObject({
      billTotalPaise: 11_900,
      balanceAfterBillPaise: 11_900,
      payment: { number: "MP/26-27/000001", keptPaise: 5_000, returnedPaise: 0 },
      balancePaise: 6_900,
    });
    const [payment] = await paymentsOf(world.customer.id);
    expect(payment).toMatchObject({
      mode: "cash",
      amountReceivedPaise: 5_000,
      amountKeptPaise: 5_000,
      amountReturnedPaise: 0,
      number: "MP/26-27/000001",
      gatepassId: world.gatepass.id,
      actorId: world.salesman.id,
    });
    expect(payment!.idempotencyKey.endsWith(":pay")).toBe(true);

    const ledgerRows = await ledgerOf(world.customer.id);
    expect(ledgerRows.map((row) => [row.entryType, row.side, row.amountPaise])).toEqual([
      ["bill", "debit", 11_900],
      ["payment", "credit", 5_000],
    ]);
    expect(ledgerRows[1]!.occurredAt.getTime() - ledgerRows[0]!.occurredAt.getTime()).toBe(1);
    expect(ledgerRows[1]).toMatchObject({ paymentId: payment!.id, gatepassId: world.gatepass.id });

    const [event] = await db
      .select()
      .from(paymentEventsTable)
      .where(eq(paymentEventsTable.paymentId, payment!.id));
    expect(event).toMatchObject({
      kind: "posted",
      amountKeptPaise: 5_000,
      previousKeptPaise: 0,
      differencePaise: 5_000,
      reason: null,
      mode: "cash",
      correctionDate: null,
      ledgerEntryId: ledgerRows[1]!.id,
    });
    // Balance always equals Debits minus Credits.
    expect(await balanceOf(world.customer.id)).toBe(11_900 - 5_000);
  });

  it("returns cash change or keeps it as Advance, at the Customer's choice", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const returned = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, {
        payment: { mode: "cash", receivedPaise: 20_000, overpay: "return_change" },
      }),
    );
    expect(returned).toMatchObject({
      payment: { keptPaise: 11_900, returnedPaise: 8_100 },
      balancePaise: 0,
    });

    const kept = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, {
        payment: { mode: "cash", receivedPaise: 20_000, overpay: "keep_advance" },
      }),
    );
    expect(kept).toMatchObject({
      payment: { keptPaise: 20_000, returnedPaise: 0 },
      balancePaise: -8_100,
    });
    const payments = await paymentsOf(world.customer.id);
    expect(payments.find((payment) => payment.amountReturnedPaise === 8_100)).toMatchObject({
      amountReceivedPaise: 20_000,
      amountKeptPaise: 11_900,
    });
  });

  it("refuses cash overpay with no choice, and return change on UPI", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    expect(
      await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, { payment: { mode: "cash", receivedPaise: 12_000 } }),
        ),
      ),
    ).toEqual({
      reason: "overpay_choice_required",
      details: { requiredPaise: 11_900, receivedPaise: 12_000 },
    });
    expect(
      await refusalOf(
        orderService.placeBookNow(
          world.salesman.id,
          bookNowInput(world, {
            payment: { mode: "upi", receivedPaise: 12_000, overpay: "return_change" },
          }),
        ),
      ),
    ).toMatchObject({ reason: "return_change_cash_only" });
    expect(await countRows()).toEqual({ orders: 0, bills: 0, ledger: 0, payments: 0 });
  });

  it("keeps bank or UPI extra as Advance, with the reference", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const result = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, {
        payment: { mode: "upi", receivedPaise: 15_000, reference: " UPI-77 " },
      }),
    );
    expect(result).toMatchObject({
      payment: { keptPaise: 15_000, returnedPaise: 0 },
      balancePaise: -3_100,
    });
    const [payment] = await paymentsOf(world.customer.id);
    expect(payment).toMatchObject({
      mode: "upi",
      reference: "UPI-77",
      amountReceivedPaise: 15_000,
    });
  });

  it("clears Pending from an Advance first: any money is extra over a covered Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await ledger.setOpeningBalance({
      customerId: world.customer.id,
      direction: "advance",
      amountPaise: 20_000,
      reason: "Carried over",
      actorId: world.admin.id,
    });

    // The ₹119 Bill leaves ₹81 Advance, so nothing is needed; returning the cash keeps nothing
    // and hands all ₹10 back.
    const returnedInput = bookNowInput(world, {
      payment: { mode: "cash", receivedPaise: 1_000, overpay: "return_change" },
    });
    const returned = await orderService.placeBookNow(world.salesman.id, returnedInput);
    expect(returned).toMatchObject({
      balanceAfterBillPaise: -8_100,
      payment: null,
      returnedPaise: 1_000,
      balancePaise: -8_100,
    });
    expect(await orderService.placeBookNow(world.salesman.id, returnedInput)).toEqual(returned);

    const kept = await orderService.placeBookNow(
      world.salesman.id,
      bookNowInput(world, {
        payment: { mode: "cash", receivedPaise: 1_000, overpay: "keep_advance" },
      }),
    );
    expect(kept).toMatchObject({
      balanceAfterBillPaise: 3_800,
      payment: { keptPaise: 1_000 },
      returnedPaise: 0,
      balancePaise: 2_800,
    });
  });

  it("refuses balance_changed when a concurrent post flips whether a Payment exists, burning no number", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const otherPayment = await buildPayment({
      customer: world.customer,
      actorId: world.admin.id,
      keptPaise: 11_900,
    });

    let releaseHolder!: () => void;
    const holderMayCommit = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let holderLocked!: () => void;
    const holderHasLock = new Promise<void>((resolve) => {
      holderLocked = resolve;
    });
    // Holds the Customer row while the Book Now reads the old Balance, then credits ₹119.
    const holder = runInTransaction(async (transaction) => {
      await ledger.lockBalance(world.customer.id, transaction);
      holderLocked();
      await holderMayCommit;
      await ledger.post(
        {
          entryType: "payment",
          paymentId: otherPayment.id,
          customerId: world.customer.id,
          actorId: world.admin.id,
        },
        transaction,
      );
    });
    await holderHasLock;

    // Before the lock: ₹119 cash clears ₹119 Pending, so a Payment (and MP) is needed. Under the
    // lock the Customer is settled, so the cash is all change and nothing is kept.
    const bookNow = refusalOf(
      orderService.placeBookNow(
        world.salesman.id,
        bookNowInput(world, {
          payment: { mode: "cash", receivedPaise: 11_900, overpay: "return_change" },
        }),
      ),
    );
    await waitForLockWaiter();
    releaseHolder();
    await holder;

    expect(await bookNow).toMatchObject({ reason: "balance_changed" });
    expect(await db.select().from(ordersTable)).toHaveLength(0);
    expect(await db.select().from(billsTable)).toHaveLength(0);
    expect(await seriesNextSeq("bill")).toBe(1);
    expect(await seriesNextSeq("payment")).toBe(1);
    expect((await soldQty(world.gatepass.id)).get(world.milk.id)).toBe(0);

    // Re-quoted and retried, it goes through with the next numbers still 000001.
    const retried = await orderService.placeBookNow(world.salesman.id, bookNowInput(world));
    expect(retried.billNumber).toBe("MB/26-27/000001");
  });
});

describe("OrderService.placeBookNow idempotency and races", () => {
  it("returns the first result for the same key, with one of everything", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const input = bookNowInput(world, { payment: { mode: "cash", receivedPaise: 5_000 } });

    const first = await orderService.placeBookNow(world.salesman.id, input);
    // A retry with a different basket still returns the first result.
    const retry = await orderService.placeBookNow(world.salesman.id, {
      ...input,
      lines: [{ sku: world.milk.sku, qty: 1 }],
    });

    expect(retry).toEqual(first);
    expect(first.payment?.number).toBe("MP/26-27/000001");
    expect(await countRows()).toEqual({ orders: 1, bills: 1, ledger: 2, payments: 1 });
    expect((await soldQty(world.gatepass.id)).get(world.milk.id)).toBe(3);
  });

  it("gives one order for two concurrent calls with one key", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const input = bookNowInput(world, { payment: { mode: "upi", receivedPaise: 2_000 } });

    const [first, second] = await Promise.all([
      orderService.placeBookNow(world.salesman.id, input),
      orderService.placeBookNow(world.salesman.id, input),
    ]);

    expect(second).toEqual(first);
    expect(await countRows()).toEqual({ orders: 1, bills: 1, ledger: 2, payments: 1 });
  });

  it("gives one Bill and one short_stock for two concurrent calls racing for the last stock", async () => {
    const world = await buildCheckoutWorld({ businessDate: today, milkIssuedQty: 3 });
    const input = () => bookNowInput(world, { lines: [{ sku: world.milk.sku, qty: 3 }] });

    const results = await Promise.allSettled([
      orderService.placeBookNow(world.salesman.id, input()),
      orderService.placeBookNow(world.salesman.id, input()),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(checkoutRefusalOf(rejected.reason)).toMatchObject({
      reason: "short_stock",
      details: { lines: [{ sku: world.milk.sku, name: "Milk 1 L", needQty: 3, leftQty: 0 }] },
    });
    expect(await db.select().from(billsTable)).toHaveLength(1);
    expect((await soldQty(world.gatepass.id)).get(world.milk.id)).toBe(3);
  });
});

describe("OrderService.placeBookNow events", () => {
  it("tells the listener Bill then Payment once, with the in-transaction Balances", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const outcomes: CheckoutOutcome[] = [];
    const service = new OrderService((outcome) => {
      outcomes.push(outcome);
    });
    const input = bookNowInput(world, { payment: { mode: "cash", receivedPaise: 5_000 } });

    const result = await service.placeBookNow(world.salesman.id, input);
    await service.placeBookNow(world.salesman.id, input);

    expect(outcomes).toHaveLength(1);
    const [payment] = await db.select().from(paymentsTable);
    const [event] = await db.select().from(paymentEventsTable);
    const [version] = await db.select().from(billVersionsTable);
    expect(outcomes[0]).toEqual({
      bill: {
        billId: result.billId,
        billVersionId: version!.id,
        versionNumber: 1,
        billNumber: "MB/26-27/000001",
        customerId: world.customer.id,
        routeId: world.route.id,
        route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
        totalPaise: 11_900,
        balanceAfterBillPaise: 11_900,
      },
      payment: {
        paymentId: payment!.id,
        postedEventId: event!.id,
        paymentNumber: "MP/26-27/000001",
        customerId: world.customer.id,
        keptPaise: 5_000,
        returnedPaise: 0,
        balanceAfterPaise: 6_900,
      },
    });
  });

  it("sends nothing on a refusal, and a throwing listener does not fail the call", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const calls: CheckoutOutcome[] = [];
    const throwing = new OrderService((outcome) => {
      calls.push(outcome);
      throw new Error("WhatsApp is down");
    });

    await expect(
      throwing.placeBookNow(world.salesman.id, bookNowInput(world, { lines: [] })),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);

    const result = await throwing.placeBookNow(world.salesman.id, bookNowInput(world));
    expect(result.billNumber).toBe("MB/26-27/000001");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.payment).toBeNull();
  });
});

describe("OrderService lock order", () => {
  it("lets a Book Now and an Admin Payment on the same Customer both commit", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const office = await buildProfile();
    const { default: DocumentNumberService } = await import("../document-numbers");
    const { default: PaymentService } = await import("../payments");
    const numbers = new DocumentNumberService();
    const payments = new PaymentService();

    // Spec H's Admin Add Payment path: allocate MP, lock the Customer, post.
    const adminPayment = () =>
      runInTransaction(async (transaction) => {
        const allocated = await numbers.allocate(
          { kind: "payment", financialYear: "26-27", actorId: office.id },
          transaction,
        );
        await ledger.lockBalance(world.customer.id, transaction);
        return payments.post(
          {
            customerId: world.customer.id,
            mode: "bank",
            receivedPaise: 1_000,
            keptPaise: 1_000,
            returnedPaise: 0,
            reason: "Office deposit",
            actorId: office.id,
            occurredAt: new Date(),
            idempotencyKey: randomUUID(),
            number: allocated.number,
          },
          transaction,
        );
      });

    const results = await Promise.all([
      orderService.placeBookNow(
        world.salesman.id,
        bookNowInput(world, {
          payment: { mode: "cash", receivedPaise: 2_000 },
        }),
      ),
      adminPayment(),
      adminPayment(),
    ]);

    expect(results).toHaveLength(3);
    expect(await db.select().from(paymentsTable)).toHaveLength(3);
    expect(await balanceOf(world.customer.id)).toBe(11_900 - 2_000 - 1_000 - 1_000);
  });
});

describe("OrderService.placeBookNow and the Customer afterwards", () => {
  it("leaves no open order, so the Customer can still be deactivated", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { default: CustomerService } = await import("../customers");
    const customerService = new CustomerService();

    await orderService.placeBookNow(world.salesman.id, bookNowInput(world));

    expect(await customerService.listOpenOrders(world.customer.id)).toEqual([]);
    const deactivated = await customerService.deactivateCustomer(world.customer.id, world.admin.id);
    expect(deactivated?.status).toBe("inactive");
  });

  it("stamps the Ledger after the Customer lock, so a retry shows the same Balance after the Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const otherPayment = await buildPayment({
      customer: world.customer,
      actorId: world.admin.id,
      keptPaise: 5_000,
    });

    let releaseHolder!: () => void;
    const holderMayCommit = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let holderLocked!: () => void;
    const holderHasLock = new Promise<void>((resolve) => {
      holderLocked = resolve;
    });
    // Holds the Customer while the Book Now starts, then credits ₹50 stamped after its start.
    const holder = runInTransaction(async (transaction) => {
      await ledger.lockBalance(world.customer.id, transaction);
      holderLocked();
      await holderMayCommit;
      await ledger.post(
        {
          entryType: "payment",
          paymentId: otherPayment.id,
          customerId: world.customer.id,
          actorId: world.admin.id,
          occurredAt: new Date("2026-10-25T06:00:05Z"),
        },
        transaction,
      );
    });
    await holderHasLock;

    const input = bookNowInput(world);
    const bookNow = orderService.placeBookNow(world.salesman.id, input);
    await waitForLockWaiter();
    // The Book Now started at 06:00:00; it gets the Customer only after the 06:00:05 credit.
    vi.setSystemTime(new Date("2026-10-25T06:00:10Z"));
    releaseHolder();
    await holder;

    const first = await bookNow;
    expect(first.balanceAfterBillPaise).toBe(11_900 - 5_000);
    expect(await orderService.placeBookNow(world.salesman.id, input)).toEqual(first);
    const rows = await ledgerOf(world.customer.id);
    expect(rows.map((row) => row.entryType)).toEqual(["payment", "bill"]);
  });
});
