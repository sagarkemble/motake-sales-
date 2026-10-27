import { randomUUID } from "node:crypto";

import { db, eq, sql } from "@repo/database";
import { auditLogsTable, billsTable, ledgerEntriesTable, ordersTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import type { AdminBillOutcome } from "../shared/bill-events";
import {
  buildCheckoutWorld,
  buildRoutePrice,
  buildVariety,
  buildVarietyTaxPeriod,
  type CheckoutWorld,
} from "../test/builders";
import {
  billItemsOf,
  expectBalanceMatchesLedger,
  ledgerRowsOf,
  refusalOf,
  soldQtyByVariety,
  versionsOf,
} from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import AdminBillService from "./index";

const today = "2026-10-25";
const outcomes: AdminBillOutcome[] = [];
const adminBillService = new AdminBillService((outcome) => {
  outcomes.push(outcome);
});

beforeEach(async () => {
  await wipeApplicationTables();
  outcomes.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  // 11:30 IST on 25 Oct 2026.
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const milkAndCurd = (world: CheckoutWorld) => [
  { varietyId: world.milk.id, quantity: 3 },
  { varietyId: world.curd.id, quantity: 1 },
];

async function countOf(table: typeof billsTable | typeof ordersTable | typeof ledgerEntriesTable) {
  return Number((await db.select({ total: sql<number>`count(*)` }).from(table))[0]!.total);
}

describe("AdminBillService.raiseBill", () => {
  it("writes an office Bill: no order, MB number, v1 Raised, stamps, Ledger debit with the reason", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: milkAndCurd(world),
      reason: "Goods sent by office van",
    });

    expect(result).toEqual({
      billId: expect.any(String),
      billNumber: "MB/26-27/000001",
      billVersionId: expect.any(String),
      totalPaise: 11_900,
      balancePaise: 11_900,
    });
    const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, result.billId));
    expect(bill).toMatchObject({
      orderId: null,
      number: "MB/26-27/000001",
      legalType: "tax_invoice",
      billDate: today,
      totalPaise: 11_900,
      roundOffPaise: 29,
      letterhead: {
        route: {
          name: world.route.name,
          code: world.route.code,
          delivery_state: "Maharashtra",
        },
        buyer: { shop_name: world.customer.shopName, phone: world.customer.phone },
        seller: { legal_name: "Motake Test Foods Pvt Ltd", gstin: "27AAAAA0000A1Z5" },
      },
    });
    const items = await billItemsOf(result.billId);
    expect(
      items.map((item) => [item.varietyId, item.orderItemId, item.quantity, item.routePricePaise]),
    ).toEqual(
      expect.arrayContaining([
        [world.milk.id, null, 3, 2_499],
        [world.curd.id, null, 1, 4_000],
      ]),
    );
    expect(items).toHaveLength(2);
    const [v1] = await versionsOf(result.billId);
    expect(v1).toMatchObject({
      id: result.billVersionId,
      versionNumber: 1,
      reason: "Raised",
      actorId: world.admin.id,
      pdfKey: null,
    });
    expect((v1!.items as Array<{ id: string }>).map((item) => item.id).sort()).toEqual(
      items.map((item) => item.id).sort(),
    );
    expect(await ledgerRowsOf(world.customer.id)).toEqual([
      expect.objectContaining({
        entryType: "bill",
        side: "debit",
        amountPaise: 11_900,
        billId: result.billId,
        reason: "Goods sent by office van",
        actorId: world.admin.id,
        gatepassId: null,
      }),
    ]);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(11_900);
    // No order, no GatePass stock, no audit row.
    expect(await countOf(ordersTable)).toBe(0);
    expect(await soldQtyByVariety(world.gatepass.id)).toEqual({
      [world.milk.id]: 0,
      [world.curd.id]: 0,
    });
    expect(await db.select().from(auditLogsTable)).toEqual([]);
    expect(outcomes).toEqual([
      {
        kind: "bill_raised",
        customerId: world.customer.id,
        reason: "Goods sent by office van",
        balanceAfterPaise: 11_900,
        billId: result.billId,
        billNumber: "MB/26-27/000001",
        billVersionId: result.billVersionId,
        versionNumber: 1,
        totalPaise: 11_900,
      },
    ]);
  });

  it("merges the same Variety entered twice into one line", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: [
        { varietyId: world.milk.id, quantity: 1 },
        { varietyId: world.milk.id, quantity: 2 },
      ],
      reason: "Office sale",
    });

    const items = await billItemsOf(result.billId);
    expect(items.map((item) => [item.varietyId, item.quantity])).toEqual([[world.milk.id, 3]]);
  });

  it("previews taxable, GST, round-off and total and lists unsellable lines, writing nothing", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const unpriced = await buildVariety({ name: "Ghee 1 kg" });
    await buildVarietyTaxPeriod(unpriced.id);

    const preview = await adminBillService.previewRaiseBill({
      customerId: world.customer.id,
      lines: [...milkAndCurd(world), { varietyId: unpriced.id, quantity: 1 }],
    });

    expect(preview.totals).toEqual({
      taxablePaise: 11_497,
      cgstPaise: 187,
      sgstPaise: 187,
      igstPaise: 0,
      grossPaise: 11_871,
      roundOffPaise: 29,
      totalPaise: 11_900,
      totalQuantity: 4,
      legalType: "tax_invoice",
    });
    expect(preview.badLines).toEqual([{ varietyId: unpriced.id, reason: "no_route_price" }]);
    expect(preview.balance).toEqual({ balancePaise: 0, state: "settled", amountPaise: 0 });
    expect(await countOf(billsTable)).toBe(0);
  });

  it("lists only the Varieties sellable on the Customer's Route today", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const untaxed = await buildVariety({ name: "Paneer 200 g" });
    await buildRoutePrice(world.route.id, untaxed.id, 9_000);

    const catalog = await adminBillService.listRaiseBillCatalog(world.customer.id);

    expect(catalog.map((row) => [row.varietyId, row.routePricePaise, row.gstRateBps])).toEqual(
      expect.arrayContaining([
        [world.milk.id, 2_499, 500],
        [world.curd.id, 4_000, 0],
      ]),
    );
    expect(catalog).toHaveLength(2);
  });

  describe("refuses the whole Bill, writing nothing and sending nothing", () => {
    it.each([
      ["an empty basket", () => [], "empty_basket"],
      ["qty 0", (world: CheckoutWorld) => [{ varietyId: world.milk.id, quantity: 0 }], "bad_lines"],
    ] as const)("for %s", async (_label, lines, reason) => {
      const world = await buildCheckoutWorld({ businessDate: today });
      expect(
        await refusalOf(
          adminBillService.raiseBill(world.admin.id, {
            idempotencyKey: randomUUID(),
            customerId: world.customer.id,
            lines: lines(world),
            reason: "Office sale",
          }),
        ),
      ).toMatchObject({ reason });
      expect(await countOf(billsTable)).toBe(0);
      expect(outcomes).toEqual([]);
    });

    it("for a Variety with no Route price or no covering tax period, naming each", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const unpriced = await buildVariety({ name: "Ghee 1 kg" });
      await buildVarietyTaxPeriod(unpriced.id);
      const untaxed = await buildVariety({ name: "Paneer 200 g" });
      await buildRoutePrice(world.route.id, untaxed.id, 9_000);

      const refusal = await refusalOf(
        adminBillService.raiseBill(world.admin.id, {
          idempotencyKey: randomUUID(),
          customerId: world.customer.id,
          lines: [
            { varietyId: world.milk.id, quantity: 1 },
            { varietyId: unpriced.id, quantity: 1 },
            { varietyId: untaxed.id, quantity: 1 },
          ],
          reason: "Office sale",
        }),
      );

      expect(refusal).toEqual({
        reason: "bad_lines",
        details: {
          lines: expect.arrayContaining([
            { varietyId: unpriced.id, reason: "no_route_price" },
            { varietyId: untaxed.id, reason: "no_tax_period" },
          ]),
        },
      });
      expect(await countOf(billsTable)).toBe(0);
    });

    it("for a basket that totals ₹0.00", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const sachet = await buildVariety({ name: "Sample sachet" });
      await buildRoutePrice(world.route.id, sachet.id, 10);
      await buildVarietyTaxPeriod(sachet.id, { exempt: true, gstRateBps: 0 });

      expect(
        await refusalOf(
          adminBillService.raiseBill(world.admin.id, {
            idempotencyKey: randomUUID(),
            customerId: world.customer.id,
            lines: [{ varietyId: sachet.id, quantity: 1 }],
            reason: "Sample",
          }),
        ),
      ).toMatchObject({ reason: "bill_total_zero" });
      expect(await countOf(billsTable)).toBe(0);
    });

    it("for a deactivated Customer", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);

      expect(
        await refusalOf(
          adminBillService.raiseBill(world.admin.id, {
            idempotencyKey: randomUUID(),
            customerId: world.customer.id,
            lines: milkAndCurd(world),
            reason: "Office sale",
          }),
        ),
      ).toEqual({ reason: "customer_inactive", details: { customerId: world.customer.id } });
      expect(
        await refusalOf(
          adminBillService.previewRaiseBill({
            customerId: world.customer.id,
            lines: milkAndCurd(world),
          }),
        ),
      ).toMatchObject({ reason: "customer_inactive" });
      expect(await countOf(billsTable)).toBe(0);
    });
  });
});

describe("AdminBillService.raiseBill idempotency (db-decisions/0015)", () => {
  it("the same key twice returns the first Bill, writes one and uses no second number", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const input = {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: milkAndCurd(world),
      reason: "Goods sent by office van",
    };

    const first = await adminBillService.raiseBill(world.admin.id, input);
    const replay = await adminBillService.raiseBill(world.admin.id, input);

    expect(replay).toEqual(first);
    expect(await countOf(billsTable)).toBe(1);
    expect(await countOf(ledgerEntriesTable)).toBe(1);
    expect(outcomes).toHaveLength(1);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(11_900);
    const next = await adminBillService.raiseBill(world.admin.id, {
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(next.billNumber).toBe("MB/26-27/000002");
  });

  it("the same key twice at once writes one Bill and both get its result", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const input = {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: milkAndCurd(world),
      reason: "Goods sent by office van",
    };

    const [first, second] = await Promise.all([
      adminBillService.raiseBill(world.admin.id, input),
      adminBillService.raiseBill(world.admin.id, input),
    ]);

    expect(second).toEqual(first);
    expect(await countOf(billsTable)).toBe(1);
    expect(outcomes).toHaveLength(1);
    const next = await adminBillService.raiseBill(world.admin.id, {
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(next.billNumber).toBe("MB/26-27/000002");
  });

  it("refuses the same key with other lines or another Customer as idempotency_key_reused", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const idempotencyKey = randomUUID();
    await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey,
      customerId: world.customer.id,
      lines: milkAndCurd(world),
      reason: "Goods sent by office van",
    });
    outcomes.length = 0;

    expect(
      await refusalOf(
        adminBillService.raiseBill(world.admin.id, {
          idempotencyKey,
          customerId: world.customer.id,
          lines: [{ varietyId: world.milk.id, quantity: 4 }],
          reason: "Goods sent by office van",
        }),
      ),
    ).toMatchObject({ reason: "idempotency_key_reused" });
    expect(await countOf(billsTable)).toBe(1);
    expect(outcomes).toEqual([]);
  });

  it("a replay names the same lines however they were typed (repeats merged)", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const idempotencyKey = randomUUID();
    const first = await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey,
      customerId: world.customer.id,
      lines: milkAndCurd(world),
      reason: "Office",
    });

    const replay = await adminBillService.raiseBill(world.admin.id, {
      idempotencyKey,
      customerId: world.customer.id,
      lines: [
        { varietyId: world.curd.id, quantity: 1 },
        { varietyId: world.milk.id, quantity: 1 },
        { varietyId: world.milk.id, quantity: 2 },
      ],
      reason: "Office",
    });

    expect(replay).toEqual(first);
  });
});
