import { randomUUID } from "node:crypto";

import { db, eq, sql } from "@repo/database";
import {
  billItemsTable,
  billsTable,
  customersTable,
  documentNumberSeriesTable,
  gatepassItemsTable,
  gatepassesTable,
  ledgerEntriesTable,
  orderItemsTable,
  ordersTable,
  orderVersionsTable,
  paymentsTable,
  routePricesTable,
  routesTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkoutRefusalOf } from "../errors";
import LedgerService from "../ledger";
import {
  buildCheckoutWorld,
  buildCustomer,
  buildGatepass,
  buildRoute,
  buildSalesman,
  buildVariety,
  buildVarietyTaxPeriod,
  type CheckoutWorld,
} from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import OrderService, { type PlacePreOrderInput } from "./index";

const orderService = new OrderService();
const ledger = new LedgerService();
const today = "2026-10-25";
const tomorrow = "2026-10-26";

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

function preOrderInput(
  world: CheckoutWorld,
  overrides: Partial<PlacePreOrderInput> = {},
): PlacePreOrderInput {
  return {
    customerId: world.customer.id,
    scheduledDate: tomorrow,
    idempotencyKey: randomUUID(),
    lines: [
      { sku: world.milk.sku, qty: 3 },
      { sku: world.curd.sku, qty: 1 },
    ],
    ...overrides,
  };
}

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

async function billSeriesNextSeq(financialYear = "26-27") {
  const [row] = await db
    .select({ nextSeq: documentNumberSeriesTable.nextSeq })
    .from(documentNumberSeriesTable)
    .where(
      sql`${documentNumberSeriesTable.kind} = 'bill' AND ${documentNumberSeriesTable.financialYear} = ${financialYear}`,
    );
  return row?.nextSeq ?? 1;
}

async function soldQtyOf(gatepassId: string) {
  const rows = await db
    .select({ soldQty: gatepassItemsTable.soldQty })
    .from(gatepassItemsTable)
    .where(eq(gatepassItemsTable.gatepassId, gatepassId));
  return rows.reduce((total, row) => total + row.soldQty, 0);
}

// Moves the clock to `day` 11:30 IST and the world's GatePass to that business date.
async function moveToDay(world: CheckoutWorld, day: string) {
  vi.setSystemTime(new Date(`${day}T06:00:00Z`));
  await db
    .update(gatepassesTable)
    .set({ businessDate: day })
    .where(eq(gatepassesTable.id, world.gatepass.id));
}

const salesmanActor = (world: CheckoutWorld) =>
  ({ profileId: world.salesman.id, role: "salesman" }) as const;
const adminActor = (world: CheckoutWorld) =>
  ({ profileId: world.admin.id, role: "admin" }) as const;

function fulfilInput(orderId: string, receivedPaise = 0) {
  return {
    orderId,
    idempotencyKey: randomUUID(),
    payment: { mode: "cash" as const, receivedPaise },
  };
}

describe("OrderService.placePreOrder", () => {
  it("locks today's price, tax and Route stamp, with no Bill, number, Ledger, stock or Payment", async () => {
    const world = await buildCheckoutWorld({ businessDate: today, milkIssuedQty: 1 });

    // Stock is not checked: 30 packs on a GatePass carrying 1.
    const result = await orderService.placePreOrder(
      world.salesman.id,
      preOrderInput(world, {
        lines: [
          { sku: world.milk.sku, qty: 30 },
          { sku: world.curd.sku, qty: 1 },
        ],
        notes: "Before 7 am",
      }),
    );

    // 30 × ₹24.99 = ₹749.70 + 5% (₹18.74 + ₹18.74) + ₹40 = ₹827.18 → ₹827.
    expect(result).toEqual({
      orderId: expect.any(String),
      scheduledDate: tomorrow,
      indicativeTotalPaise: 82_700,
      balancePaise: 0,
    });
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, result.orderId));
    expect(order).toMatchObject({
      type: "pre_order",
      status: "scheduled",
      scheduledDate: tomorrow,
      salesmanId: world.salesman.id,
      routeId: world.route.id,
      gatepassId: null,
      notes: "Before 7 am",
      fulfilledAt: null,
    });
    const items = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, result.orderId));
    expect(items.find((item) => item.varietyId === world.milk.id)).toMatchObject({
      quantity: 30,
      routePricePaise: 2_499,
      exempt: false,
      gstRateBps: 500,
      stamp: { name: "Milk 1 L", unit: "pack", hsn: "0401" },
    });
    const versions = await db
      .select()
      .from(orderVersionsTable)
      .where(eq(orderVersionsTable.orderId, result.orderId));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      versionNumber: 1,
      reason: "Placed",
      header: {
        route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
      },
    });

    expect(await db.select().from(billsTable)).toHaveLength(0);
    expect(await db.select().from(ledgerEntriesTable)).toHaveLength(0);
    expect(await db.select().from(paymentsTable)).toHaveLength(0);
    expect(await billSeriesNextSeq()).toBe(1);
    expect(await soldQtyOf(world.gatepass.id)).toBe(0);
  });

  it("returns the first result for the same key", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const input = preOrderInput(world);

    const first = await orderService.placePreOrder(world.salesman.id, input);
    const retry = await orderService.placePreOrder(world.salesman.id, {
      ...input,
      scheduledDate: "2026-11-01",
    });

    expect(retry).toEqual(first);
    expect(await db.select().from(ordersTable)).toHaveLength(1);
  });

  describe("refuses, writing nothing", () => {
    it("for a date of today or before", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      for (const scheduledDate of [today, "2026-10-01"]) {
        expect(
          await refusalOf(
            orderService.placePreOrder(world.salesman.id, preOrderInput(world, { scheduledDate })),
          ),
        ).toEqual({
          reason: "scheduled_date_not_after_today",
          details: { scheduledDate, today },
        });
      }
      expect(await db.select().from(ordersTable)).toHaveLength(0);
    });

    it("with no Active GatePass, or for a Customer off its Route", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const elsewhere = await buildCustomer(world.admin.id, { routeId: (await buildRoute()).id });
      expect(
        await refusalOf(
          orderService.placePreOrder(
            world.salesman.id,
            preOrderInput(world, { customerId: elsewhere.id }),
          ),
        ),
      ).toMatchObject({ reason: "customer_not_on_route" });

      await db
        .update(gatepassesTable)
        .set({ status: "pending_verification" })
        .where(eq(gatepassesTable.id, world.gatepass.id));
      expect(
        await refusalOf(orderService.placePreOrder(world.salesman.id, preOrderInput(world))),
      ).toMatchObject({ reason: "no_active_gatepass" });
      expect(await db.select().from(ordersTable)).toHaveLength(0);
    });

    it("for an empty basket, bad lines or a price field", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      expect(
        await refusalOf(
          orderService.placePreOrder(world.salesman.id, preOrderInput(world, { lines: [] })),
        ),
      ).toMatchObject({ reason: "empty_basket" });
      expect(
        await refusalOf(
          orderService.placePreOrder(
            world.salesman.id,
            preOrderInput(world, { lines: [{ sku: "vr-none-001", qty: 2 }] }),
          ),
        ),
      ).toEqual({
        reason: "bad_lines",
        details: { lines: [{ sku: "vr-none-001", reason: "unknown_sku" }] },
      });
      expect(
        await refusalOf(
          orderService.placePreOrder(
            world.salesman.id,
            preOrderInput(world, { lines: [{ sku: world.milk.sku, qty: 1, gstRateBps: 0 }] }),
          ),
        ),
      ).toMatchObject({ reason: "price_field_refused" });
      expect(await db.select().from(ordersTable)).toHaveLength(0);
    });
  });
});

describe("OrderService.fulfilPreOrder", () => {
  it("bills the locked terms and Route stamp even after price, tax and delivery state change", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));

    // After place: a new Route price, a 12% period from tomorrow, the Route moved to Karnataka.
    await db
      .update(routePricesTable)
      .set({ pricePaise: 9_999 })
      .where(eq(routePricesTable.varietyId, world.milk.id));
    await buildVarietyTaxPeriod(world.milk.id, { effectiveFrom: tomorrow, gstRateBps: 1_200 });
    await db
      .update(routesTable)
      .set({ deliveryState: "Karnataka", name: "Renamed Route" })
      .where(eq(routesTable.id, world.route.id));
    await moveToDay(world, tomorrow);

    const result = await orderService.fulfilPreOrder(
      salesmanActor(world),
      fulfilInput(placed.orderId),
    );

    // Same as at place: 3 × ₹24.99 at 5% intra-state + ₹40 exempt = ₹119.
    expect(result).toMatchObject({
      orderId: placed.orderId,
      billNumber: "MB/26-27/000001",
      billTotalPaise: 11_900,
      balanceAfterBillPaise: 11_900,
      payment: null,
      balancePaise: 11_900,
    });
    const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, result.billId));
    expect(bill).toMatchObject({
      orderId: placed.orderId,
      billDate: tomorrow,
      cgstPaise: 187,
      sgstPaise: 187,
      igstPaise: 0,
      letterhead: {
        route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
      },
    });
    const billItems = await db
      .select()
      .from(billItemsTable)
      .where(eq(billItemsTable.billId, result.billId));
    expect(billItems.find((item) => item.varietyId === world.milk.id)).toMatchObject({
      routePricePaise: 2_499,
      gstRateBps: 500,
    });

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, placed.orderId));
    expect(order).toMatchObject({
      status: "fulfilled",
      fulfilledBy: world.salesman.id,
      gatepassId: world.gatepass.id,
    });
    const versions = await db
      .select()
      .from(orderVersionsTable)
      .where(eq(orderVersionsTable.orderId, placed.orderId));
    const fulfilled = versions.find((version) => version.versionNumber === 2);
    expect(fulfilled).toMatchObject({
      reason: "Fulfilled",
      actorId: world.salesman.id,
      header: {
        status: "fulfilled",
        route: { name: world.route.name, code: world.route.code, delivery_state: "Maharashtra" },
      },
    });

    const [debit] = await db.select().from(ledgerEntriesTable);
    expect(debit).toMatchObject({
      entryType: "bill",
      amountPaise: 11_900,
      gatepassId: world.gatepass.id,
    });
    // A fulfil never touches GatePass stock.
    expect(await soldQtyOf(world.gatepass.id)).toBe(0);
  });

  it("lets Admin fulfil with no GatePass, and takes a checkout Payment", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    vi.setSystemTime(new Date("2026-10-28T06:00:00Z"));

    const result = await orderService.fulfilPreOrder(adminActor(world), {
      ...fulfilInput(placed.orderId),
      payment: { mode: "bank", receivedPaise: 11_900, reference: "NEFT-1" },
    });

    expect(result).toMatchObject({
      billTotalPaise: 11_900,
      payment: { number: "MP/26-27/000001", keptPaise: 11_900, returnedPaise: 0 },
      balancePaise: 0,
    });
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, placed.orderId));
    expect(order).toMatchObject({ fulfilledBy: world.admin.id, gatepassId: null });
    const rows = await db.select().from(ledgerEntriesTable);
    expect(rows.every((row) => row.gatepassId === null && row.actorId === world.admin.id)).toBe(
      true,
    );
    expect(await ledger.getBalance(world.customer.id)).toMatchObject({ balancePaise: 0 });
  });

  it("numbers the Bill in the fulfil date's financial year across 31 March / 1 April", async () => {
    vi.setSystemTime(new Date("2027-03-31T06:00:00Z"));
    const world = await buildCheckoutWorld({ businessDate: "2027-03-31" });
    const placed = await orderService.placePreOrder(
      world.salesman.id,
      preOrderInput(world, { scheduledDate: "2027-04-01" }),
    );
    await moveToDay(world, "2027-04-01");

    const result = await orderService.fulfilPreOrder(
      salesmanActor(world),
      fulfilInput(placed.orderId),
    );

    expect(result.billNumber).toBe("MB/27-28/000001");
  });

  it("refuses before the scheduled date, for salesman and Admin alike", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));

    for (const actor of [salesmanActor(world), adminActor(world)]) {
      expect(
        await refusalOf(orderService.fulfilPreOrder(actor, fulfilInput(placed.orderId))),
      ).toEqual({ reason: "fulfil_too_early", details: { scheduledDate: tomorrow } });
    }
    expect(await db.select().from(billsTable)).toHaveLength(0);
    expect(await billSeriesNextSeq()).toBe(1);
  });

  it("refuses a salesman on another Route or with no Active GatePass", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    await moveToDay(world, tomorrow);
    const { profile: elsewhere } = await buildSalesman();
    const otherRoute = await buildRoute();
    await buildGatepass({
      salesmanId: elsewhere.id,
      issuedBy: world.admin.id,
      routeId: otherRoute.id,
      businessDate: tomorrow,
      lines: [],
    });
    const { profile: idle } = await buildSalesman();

    expect(
      await refusalOf(
        orderService.fulfilPreOrder(
          { profileId: elsewhere.id, role: "salesman" },
          fulfilInput(placed.orderId),
        ),
      ),
    ).toEqual({
      reason: "wrong_route",
      details: { preOrderRouteId: world.route.id, gatepassRouteId: otherRoute.id },
    });
    expect(
      await refusalOf(
        orderService.fulfilPreOrder({ profileId: idle.id, role: "salesman" }, fulfilInput(placed.orderId)),
      ),
    ).toMatchObject({ reason: "no_active_gatepass" });
    expect(await db.select().from(billsTable)).toHaveLength(0);
  });

  it("lets another salesman on the same Route fulfil", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));
    const { profile: colleague } = await buildSalesman();
    const colleagueGatepass = await buildGatepass({
      salesmanId: colleague.id,
      issuedBy: world.admin.id,
      routeId: world.route.id,
      businessDate: tomorrow,
      lines: [],
    });

    await orderService.fulfilPreOrder(
      { profileId: colleague.id, role: "salesman" },
      fulfilInput(placed.orderId),
    );

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, placed.orderId));
    expect(order).toMatchObject({ fulfilledBy: colleague.id, gatepassId: colleagueGatepass.id });
  });

  it("refuses a cancelled Pre-order, a Book Now, and a Customer since moved off the Route", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const cancelled = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    const moved = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    const bookNow = await orderService.placeBookNow(world.salesman.id, {
      customerId: world.customer.id,
      idempotencyKey: randomUUID(),
      lines: [{ sku: world.milk.sku, qty: 1 }],
      payment: { mode: "cash", receivedPaise: 0 },
    });
    await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, cancelled.orderId));
    await moveToDay(world, tomorrow);

    expect(
      await refusalOf(
        orderService.fulfilPreOrder(salesmanActor(world), fulfilInput(cancelled.orderId)),
      ),
    ).toMatchObject({ reason: "pre_order_cancelled" });
    expect(
      await refusalOf(orderService.fulfilPreOrder(adminActor(world), fulfilInput(bookNow.orderId))),
    ).toMatchObject({ reason: "not_a_pre_order" });

    await db
      .update(customersTable)
      .set({ routeId: (await buildRoute()).id })
      .where(eq(customersTable.id, world.customer.id));
    expect(
      await refusalOf(orderService.fulfilPreOrder(adminActor(world), fulfilInput(moved.orderId))),
    ).toMatchObject({ reason: "customer_not_on_route" });
    expect(await db.select().from(billsTable)).toHaveLength(1);
  });

  it("refuses a second fulfil by someone else with who and which MB, and replays the first", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    await moveToDay(world, tomorrow);
    const input = fulfilInput(placed.orderId, 5_000);

    const first = await orderService.fulfilPreOrder(salesmanActor(world), input);
    const retry = await orderService.fulfilPreOrder(salesmanActor(world), input);
    expect(retry).toEqual(first);

    expect(
      await refusalOf(orderService.fulfilPreOrder(adminActor(world), fulfilInput(placed.orderId))),
    ).toEqual({
      reason: "already_fulfilled",
      details: {
        billNumber: "MB/26-27/000001",
        fulfilledAt: "2026-10-26T06:00:00.000Z",
        fulfilledById: world.salesman.id,
        fulfilledByName: world.salesman.name,
      },
    });
    expect(await db.select().from(billsTable)).toHaveLength(1);
    expect(await db.select().from(paymentsTable)).toHaveLength(1);
  });

  it("gives one Bill when Admin and a salesman fulfil at the same time", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    await moveToDay(world, tomorrow);

    const results = await Promise.allSettled([
      orderService.fulfilPreOrder(salesmanActor(world), fulfilInput(placed.orderId)),
      orderService.fulfilPreOrder(adminActor(world), fulfilInput(placed.orderId)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(checkoutRefusalOf(rejected.reason)).toMatchObject({ reason: "already_fulfilled" });
    expect(await db.select().from(billsTable)).toHaveLength(1);
    expect(await db.select().from(ledgerEntriesTable)).toHaveLength(1);
  });
});

describe("OrderService.listRoutePreorders", () => {
  it("lists open Pre-orders on the GatePass Route from any salesman, with due state", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { profile: colleague } = await buildSalesman({ name: "Colleague" });
    await buildGatepass({
      salesmanId: colleague.id,
      issuedBy: world.admin.id,
      routeId: world.route.id,
      businessDate: today,
      lines: [],
    });
    const upcoming = await orderService.placePreOrder(
      world.salesman.id,
      preOrderInput(world, { scheduledDate: "2026-10-28" }),
    );
    const dueOne = await orderService.placePreOrder(
      colleague.id,
      preOrderInput(world, { scheduledDate: "2026-10-27" }),
    );
    const overdue = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    const fulfilled = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    const cancelled = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(eq(ordersTable.id, cancelled.orderId));
    // An open Pre-order on another Route is not shown.
    const elsewhere = await buildCheckoutWorld({ businessDate: today, withSeller: false });
    await orderService.placePreOrder(elsewhere.salesman.id, preOrderInput(elsewhere));

    await moveToDay(world, "2026-10-27");
    await orderService.fulfilPreOrder(adminActor(world), fulfilInput(fulfilled.orderId));

    const listed = await orderService.listRoutePreorders(world.salesman.id);

    expect(listed.map((row) => [row.id, row.dueState])).toEqual([
      [overdue.orderId, "overdue"],
      [dueOne.orderId, "due"],
      [upcoming.orderId, "upcoming"],
    ]);
    expect(listed[1]).toMatchObject({
      customerId: world.customer.id,
      customerShopName: world.customer.shopName,
      placedBySalesmanId: colleague.id,
      placedByName: "Colleague",
      totalQuantity: 4,
    });
    expect(listed[1]!.lines).toHaveLength(2);
  });

  it("refuses with no Active GatePass", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await db
      .update(gatepassesTable)
      .set({ status: "closed" })
      .where(eq(gatepassesTable.id, world.gatepass.id));
    expect(await refusalOf(orderService.listRoutePreorders(world.salesman.id))).toMatchObject({
      reason: "no_active_gatepass",
    });
  });
});

describe("OrderService.quote", () => {
  it("prices a Book Now from the server with bad and short lines and the amount to clear", async () => {
    const world = await buildCheckoutWorld({ businessDate: today, milkIssuedQty: 2 });
    await ledger.setOpeningBalance({
      customerId: world.customer.id,
      direction: "pending",
      amountPaise: 1_000,
      reason: "Carried over",
      actorId: world.admin.id,
    });

    const quote = await orderService.quote(salesmanActor(world), {
      customerId: world.customer.id,
      orderType: "book_now",
      lines: [
        { sku: world.milk.sku, qty: 3 },
        { sku: world.curd.sku, qty: 1 },
        { sku: "vr-none-001", qty: 1 },
      ],
    });

    expect(quote.lines).toHaveLength(2);
    expect(quote.lines.find((line) => line.sku === world.milk.sku)).toMatchObject({
      name: "Milk 1 L",
      qty: 3,
      routePricePaise: 2_499,
      taxablePaise: 7_497,
      cgstPaise: 187,
      sgstPaise: 187,
      igstPaise: 0,
    });
    expect(quote.totals).toMatchObject({
      taxablePaise: 11_497,
      roundOffPaise: 29,
      totalPaise: 11_900,
      totalQuantity: 4,
      legalType: "tax_invoice",
    });
    expect(quote.badLines).toEqual([{ sku: "vr-none-001", reason: "unknown_sku" }]);
    expect(quote.shortLines).toEqual([
      { sku: world.milk.sku, name: "Milk 1 L", needQty: 3, leftQty: 2 },
    ]);
    expect(quote.balance?.balancePaise).toBe(1_000);
    expect(quote.requiredToClearPaise).toBe(12_900);
    expect(await db.select().from(ordersTable)).toHaveLength(0);
  });

  it("quotes IGST for an inter-state Route and nothing to clear for a Pre-order place", async () => {
    const world = await buildCheckoutWorld({ businessDate: today, deliveryState: "Karnataka" });

    const quote = await orderService.quote(salesmanActor(world), {
      customerId: world.customer.id,
      orderType: "pre_order",
      lines: [{ sku: world.milk.sku, qty: 100 }],
    });

    expect(quote.totals).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 12_495 });
    expect(quote.shortLines).toEqual([]);
    expect(quote.requiredToClearPaise).toBeNull();
  });

  it("quotes a fulfil from the locked terms, and Admin on the Customer's Route", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, preOrderInput(world));
    await db
      .update(routePricesTable)
      .set({ pricePaise: 9_999 })
      .where(eq(routePricesTable.varietyId, world.milk.id));

    const fulfilQuote = await orderService.quote(adminActor(world), {
      orderType: "pre_order",
      orderId: placed.orderId,
    });
    expect(fulfilQuote.totals.totalPaise).toBe(11_900);
    expect(fulfilQuote.lines.find((line) => line.varietyId === world.milk.id)).toMatchObject({
      sku: world.milk.sku,
      routePricePaise: 2_499,
    });
    expect(fulfilQuote.requiredToClearPaise).toBe(11_900);

    const adminQuote = await orderService.quote(adminActor(world), {
      customerId: world.customer.id,
      orderType: "book_now",
      lines: [{ sku: world.milk.sku, qty: 1 }],
    });
    expect(adminQuote.lines[0]!.routePricePaise).toBe(9_999);
  });

  it("refuses a price field like every checkout call", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const variety = await buildVariety();
    expect(
      await refusalOf(
        orderService.quote(salesmanActor(world), {
          orderType: "book_now",
          lines: [{ sku: variety.sku, qty: 1, pricePaise: 1 }],
        }),
      ),
    ).toMatchObject({ reason: "price_field_refused" });
  });
});
