import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import {
  billsTable,
  customersTable,
  ledgerEntriesTable,
  ordersTable,
  paymentsTable,
} from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BillService from "../bills";
import { checkoutRefusalOf } from "../errors";
import LedgerService from "../ledger";
import OrderService from "../orders";
import PaymentService from "../payments";
import { buildCheckoutWorld, buildRoute, type CheckoutWorld } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import CustomerService from "./index";

const customerService = new CustomerService();
const orderService = new OrderService();
const paymentService = new PaymentService();
const billService = new BillService();
const ledger = new LedgerService();
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

const lines = (world: CheckoutWorld) => [{ sku: world.milk.sku, qty: 1 }];

async function deactivate(world: CheckoutWorld) {
  await customerService.deactivateCustomer(world.customer.id, world.admin.id);
}

describe("Deactivating a Customer", () => {
  it("is refused while a Pre-order is open, and allowed once there is none", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, {
      customerId: world.customer.id,
      scheduledDate: tomorrow,
      idempotencyKey: randomUUID(),
      lines: lines(world),
    });

    await expect(
      customerService.deactivateCustomer(world.customer.id, world.admin.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Customer has 1 open Pre-order and cannot be deactivated",
    });

    await orderService.cancelOrder(placed.orderId, world.admin.id);
    const deactivated = await customerService.deactivateCustomer(world.customer.id, world.admin.id);
    expect(deactivated?.status).toBe("inactive");
  });
});

describe("A deactivated Customer", () => {
  it("refuses Book Now, Pre-order place and field Payment as customer_inactive", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await deactivate(world);
    const expected = { reason: "customer_inactive", details: { customerId: world.customer.id } };

    expect(
      await refusalOf(
        orderService.placeBookNow(world.salesman.id, {
          customerId: world.customer.id,
          idempotencyKey: randomUUID(),
          lines: lines(world),
          payment: { mode: "cash", receivedPaise: 0 },
        }),
      ),
    ).toEqual(expected);
    expect(
      await refusalOf(
        orderService.placePreOrder(world.salesman.id, {
          customerId: world.customer.id,
          scheduledDate: tomorrow,
          idempotencyKey: randomUUID(),
          lines: lines(world),
        }),
      ),
    ).toEqual(expected);
    expect(
      await refusalOf(
        paymentService.recordFieldPayment(world.salesman.id, {
          customerId: world.customer.id,
          idempotencyKey: randomUUID(),
          mode: "upi",
          receivedPaise: 1_000,
        }),
      ),
    ).toEqual(expected);
    expect(await db.select().from(ordersTable)).toHaveLength(0);
    expect(await db.select().from(paymentsTable)).toHaveLength(0);
  });

  it("refuses fulfilling a Pre-order placed before it was deactivated", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await orderService.placePreOrder(world.salesman.id, {
      customerId: world.customer.id,
      scheduledDate: tomorrow,
      idempotencyKey: randomUUID(),
      lines: lines(world),
    });
    // Deactivation itself refuses open Pre-orders, so this row-level state can only come from data
    // written before that rule; fulfil still refuses it.
    await db
      .update(customersTable)
      .set({ status: "inactive", deletedAt: new Date() })
      .where(eq(customersTable.id, world.customer.id));
    vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));

    expect(
      await refusalOf(
        orderService.fulfilPreOrder(
          { profileId: world.admin.id, role: "admin" },
          {
            orderId: placed.orderId,
            idempotencyKey: randomUUID(),
            payment: { mode: "cash", receivedPaise: 0 },
          },
        ),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
    expect(await db.select().from(billsTable)).toHaveLength(0);
  });

  it("refuses a Bill, a posted Payment and an Opening balance on the shared write paths", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await deactivate(world);

    // Spec G's Admin Raise Bill path.
    expect(
      await refusalOf(
        runInTransaction((transaction) =>
          billService.issueBill(
            {
              actorId: world.admin.id,
              customerId: world.customer.id,
              orderId: null,
              routeStamp: {
                name: world.route.name,
                code: world.route.code,
                delivery_state: "Maharashtra",
              },
              lines: [
                {
                  varietyId: world.milk.id,
                  orderItemId: null,
                  stamp: { name: "Milk 1 L", unit: "pack", hsn: "0401" },
                  quantity: 1,
                  routePricePaise: 2_499,
                  exempt: false,
                  gstRateBps: 500,
                },
              ],
              gatepassId: null,
              billDate: today,
              billNumber: "MB/26-27/000001",
            },
            transaction,
          ),
        ),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
    // Spec H's Admin Add Payment path.
    expect(
      await refusalOf(
        runInTransaction((transaction) =>
          paymentService.post(
            {
              customerId: world.customer.id,
              mode: "bank",
              receivedPaise: 1_000,
              keptPaise: 1_000,
              returnedPaise: 0,
              reason: "Office deposit",
              actorId: world.admin.id,
              occurredAt: new Date(),
              idempotencyKey: randomUUID(),
              number: "MP/26-27/000001",
            },
            transaction,
          ),
        ),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
    expect(
      await refusalOf(
        ledger.setOpeningBalance({
          customerId: world.customer.id,
          direction: "pending",
          amountPaise: 10_000,
          reason: "Carried over",
          actorId: world.admin.id,
        }),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
    expect(await db.select().from(billsTable)).toHaveLength(0);
    expect(await db.select().from(paymentsTable)).toHaveLength(0);
    expect(await db.select().from(ledgerEntriesTable)).toHaveLength(0);
  });

  it("refuses a quote for a checkout as customer_inactive", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await deactivate(world);

    expect(
      await refusalOf(
        orderService.quote(
          { profileId: world.admin.id, role: "admin" },
          { customerId: world.customer.id, orderType: "book_now", lines: lines(world) },
        ),
      ),
    ).toMatchObject({ reason: "customer_inactive" });
  });

  it("still allows reads and profile updates: details, photo and Route", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    await deactivate(world);
    const newRoute = await buildRoute();

    const updated = await customerService.updateCustomer(
      world.customer.id,
      { shopName: "Shree Ganesh Stores" },
      world.admin.id,
    );
    const moved = await customerService.moveCustomerToRoute(
      world.customer.id,
      newRoute.id,
      world.admin.id,
    );

    expect(updated).toMatchObject({ shopName: "Shree Ganesh Stores", status: "inactive" });
    expect(moved).toMatchObject({ routeId: newRoute.id, status: "inactive" });
    expect(await customerService.getCustomerById(world.customer.id)).toMatchObject({
      routeId: newRoute.id,
    });
  });
});
