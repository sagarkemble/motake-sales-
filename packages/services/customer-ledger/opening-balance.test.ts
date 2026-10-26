import { db } from "@repo/database";
import { auditLogsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerService from "../customers";
import { buildCheckoutWorld } from "../test/builders";
import {
  expectBalanceMatchesLedger,
  ledgerRowsOf,
  placeBookNowBill,
  refusalOf,
} from "../test/admin-bill-world";
import { wipeApplicationTables } from "../test/database";
import CustomerLedgerService from "./index";

const customerLedgerService = new CustomerLedgerService();
const today = "2026-10-25";

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CustomerLedgerService.addOpeningBalance", () => {
  it("posts an Advance as a Credit dated today, with the opening_set audit row", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const result = await customerLedgerService.addOpeningBalance(world.admin.id, {
      customerId: world.customer.id,
      side: "advance",
      amountPaise: 20_000,
      reason: "Advance paid in cash before go-live",
    });

    expect(result).toEqual({
      entryId: expect.any(String),
      occurredAt: new Date("2026-10-25T06:00:00Z"),
      balance: { balancePaise: -20_000, state: "advance", amountPaise: 20_000 },
    });
    expect(await ledgerRowsOf(world.customer.id)).toEqual([
      expect.objectContaining({
        id: result.entryId,
        entryType: "opening_balance",
        side: "credit",
        amountPaise: 20_000,
        reason: "Advance paid in cash before go-live",
        actorId: world.admin.id,
      }),
    ]);
    expect(await expectBalanceMatchesLedger(world.customer.id)).toBe(-20_000);
    expect(await db.select().from(auditLogsTable)).toEqual([
      expect.objectContaining({
        action: "opening_set",
        entityType: "customer",
        entityId: world.customer.id,
      }),
    ]);
  });

  it("a past Opening date becomes the posting time (IST midnight) and the row still sorts first", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const placed = await placeBookNowBill(world);
    vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));

    const result = await customerLedgerService.addOpeningBalance(world.admin.id, {
      customerId: world.customer.id,
      side: "pending",
      amountPaise: 30_000,
      reason: "Old book",
      openingDate: "2026-10-26",
    });

    expect(result.occurredAt).toEqual(new Date("2026-10-25T18:30:00Z"));
    const rows = await customerLedgerService.listRows({ customerId: world.customer.id });
    expect(rows.items.map((row) => row.rowType)).toEqual(["opening_balance", "bill"]);
    expect(rows.items[0]!.date).toBe("2026-10-26");
    expect(result.balance.balancePaise).toBe(30_000 + placed.billTotalPaise);
  });

  describe("refuses, writing nothing", () => {
    it("a second Opening balance", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const add = () =>
        customerLedgerService.addOpeningBalance(world.admin.id, {
          customerId: world.customer.id,
          side: "pending",
          amountPaise: 10_000,
          reason: "Old book",
        });
      await add();

      expect(await refusalOf(add())).toEqual({
        reason: "opening_balance_exists",
        details: { customerId: world.customer.id },
      });
      expect(await ledgerRowsOf(world.customer.id)).toHaveLength(1);
    });

    it("two at once: exactly one lands", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      const add = () =>
        customerLedgerService.addOpeningBalance(world.admin.id, {
          customerId: world.customer.id,
          side: "pending",
          amountPaise: 10_000,
          reason: "Old book",
        });

      const settled = await Promise.allSettled([add(), add()]);

      expect(settled.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(await ledgerRowsOf(world.customer.id)).toHaveLength(1);
    });

    it("an Opening date after today", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });

      expect(
        await refusalOf(
          customerLedgerService.addOpeningBalance(world.admin.id, {
            customerId: world.customer.id,
            side: "pending",
            amountPaise: 10_000,
            reason: "Old book",
            openingDate: "2026-10-26",
          }),
        ),
      ).toEqual({
        reason: "opening_date_in_future",
        details: { openingDate: "2026-10-26", today },
      });
      expect(await ledgerRowsOf(world.customer.id)).toEqual([]);
    });

    it("a deactivated Customer", async () => {
      const world = await buildCheckoutWorld({ businessDate: today });
      await new CustomerService().deactivateCustomer(world.customer.id, world.admin.id);

      expect(
        await refusalOf(
          customerLedgerService.addOpeningBalance(world.admin.id, {
            customerId: world.customer.id,
            side: "pending",
            amountPaise: 10_000,
            reason: "Old book",
          }),
        ),
      ).toMatchObject({ reason: "customer_inactive" });
      expect(await ledgerRowsOf(world.customer.id)).toEqual([]);
      // Reads still work.
      expect((await customerLedgerService.getSummary(world.customer.id)).customer.status).toBe(
        "inactive",
      );
    });
  });
});
