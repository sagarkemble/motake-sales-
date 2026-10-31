import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import {
  billsTable,
  customersTable,
  gatepassItemsTable,
  ordersTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkoutRefusalOf } from "../errors";
import {
  buildCheckoutWorld,
  buildRoute,
  buildRoutePrice,
  type CheckoutWorld,
} from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import OrderService, { type PlaceBookNowInput, type PlacePreOrderInput } from "./index";

const orderService = new OrderService();
const today = "2026-10-25";
const tomorrow = "2026-10-26";

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

function preOrderInput(
  world: CheckoutWorld,
  overrides: Partial<PlacePreOrderInput> = {},
): PlacePreOrderInput {
  return {
    customerId: world.customer.id,
    scheduledDate: tomorrow,
    idempotencyKey: randomUUID(),
    lines: [{ sku: world.milk.sku, qty: 2 }],
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

async function soldQtys(world: CheckoutWorld) {
  const items = await db
    .select({ soldQty: gatepassItemsTable.soldQty })
    .from(gatepassItemsTable)
    .where(eq(gatepassItemsTable.gatepassId, world.gatepass.id));
  return items.map((item) => item.soldQty);
}

describe("OrderService.placeOfficeBookNow", () => {
  it("bills at once on the Customer's Route with no salesman, GatePass or stock", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await orderService.placeOfficeBookNow(
      world.admin.id,
      bookNowInput(world, { payment: { mode: "cash", receivedPaise: 10_000 } }),
    );

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, result.orderId));
    expect(order).toMatchObject({
      type: "book_now",
      status: "confirmed",
      salesmanId: null,
      gatepassId: null,
      routeId: world.route.id,
    });
    const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, result.billId));
    expect(bill).toMatchObject({ orderId: order!.id });
    expect(result.payment).not.toBeNull();
    const [payment] = await db.select().from(paymentsTable);
    expect(payment).toMatchObject({ gatepassId: null, actorId: world.admin.id });
    expect(await soldQtys(world)).toEqual([0, 0]);
  });

  it("uses the prices of the Route the Customer is on now", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const otherRoute = await buildRoute({ deliveryState: "Maharashtra" });
    await buildRoutePrice(otherRoute.id, world.milk.id, 3_000);
    await db
      .update(customersTable)
      .set({ routeId: otherRoute.id })
      .where(eq(customersTable.id, world.customer.id));

    const refusal = await refusalOf(
      orderService.placeOfficeBookNow(world.admin.id, bookNowInput(world)),
    );
    expect(refusal.reason).toBe("bad_lines");
    expect(refusal.details).toMatchObject({
      lines: [{ sku: world.curd.sku, reason: "no_route_price" }],
    });

    const result = await orderService.placeOfficeBookNow(
      world.admin.id,
      bookNowInput(world, { lines: [{ sku: world.milk.sku, qty: 1 }] }),
    );
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, result.orderId));
    expect(order!.routeId).toBe(otherRoute.id);
    expect(result.billTotalPaise).toBe(3_200);
  });

  it("returns the first result for a retry with the same key", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const input = bookNowInput(world);

    const first = await orderService.placeOfficeBookNow(world.admin.id, input);
    const again = await orderService.placeOfficeBookNow(world.admin.id, input);

    expect(again.billId).toBe(first.billId);
    expect(await db.select().from(billsTable)).toHaveLength(1);
  });

  it("refuses a deactivated Customer", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await db
      .update(customersTable)
      .set({ status: "inactive" })
      .where(eq(customersTable.id, world.customer.id));

    await expect(
      orderService.placeOfficeBookNow(world.admin.id, bookNowInput(world)),
    ).rejects.toThrow();
    expect(await db.select().from(ordersTable)).toHaveLength(0);
  });
});

describe("OrderService.placeOfficePreOrder", () => {
  it("schedules a Pre-order on the Customer's Route with no salesman and no Bill", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await orderService.placeOfficePreOrder(world.admin.id, preOrderInput(world));

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, result.orderId));
    expect(order).toMatchObject({
      type: "pre_order",
      status: "scheduled",
      salesmanId: null,
      gatepassId: null,
      routeId: world.route.id,
      scheduledDate: tomorrow,
    });
    expect(result.indicativeTotalPaise).toBe(5_200);
    expect(await db.select().from(billsTable)).toHaveLength(0);
  });

  it("refuses a date before today", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const refusal = await refusalOf(
      orderService.placeOfficePreOrder(
        world.admin.id,
        preOrderInput(world, { scheduledDate: "2026-10-24" }),
      ),
    );

    expect(refusal.reason).toBe("scheduled_date_in_past");
  });
});
