import { db, eq } from "@repo/database";
import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import { customersTable } from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import { buildCustomer, buildPayment, buildProfile } from "../test/builders";
import LedgerService from "./index";

const ledger = new LedgerService();

async function setup() {
  const admin = await buildProfile();
  const customer = await buildCustomer(admin.id);
  return { admin, customer };
}

describe("Opening balance", () => {
  it("debits Pending and credits Advance, once per Customer, and audits it with the reason", async () => {
    const { admin, customer } = await setup();
    const advanceCustomer = await buildCustomer(admin.id);
    const carriedOn = new Date("2026-03-31T12:00:00Z");

    const pending = await ledger.setOpeningBalance({
      customerId: customer.id,
      direction: "pending",
      amountPaise: 450_000,
      reason: "Old register page 12",
      occurredAt: carriedOn,
      actorId: admin.id,
    });
    const advance = await ledger.setOpeningBalance({
      customerId: advanceCustomer.id,
      direction: "advance",
      amountPaise: 20_000,
      reason: "Deposit held",
      actorId: admin.id,
    });

    expect(pending).toMatchObject({
      entryType: "opening_balance",
      side: "debit",
      balanceAfterPaise: 450_000,
      occurredAt: carriedOn,
    });
    expect(advance).toMatchObject({ side: "credit", balanceAfterPaise: -20_000 });
    await expect(
      ledger.setOpeningBalance({
        customerId: customer.id,
        direction: "pending",
        amountPaise: 1_000,
        reason: "Again",
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const [audit] = await listAuditLogsForEntity("customer", customer.id);
    expect(audit).toMatchObject({
      action: "opening_set",
      customerId: customer.id,
      reason: "Old register page 12",
      payload: { direction: "pending", amountPaise: 450_000 },
    });
  });

  it("requires a reason and a positive amount", async () => {
    const { admin, customer } = await setup();
    const base = { customerId: customer.id, direction: "pending" as const, actorId: admin.id };

    await expect(
      ledger.setOpeningBalance({ ...base, amountPaise: 1_000, reason: " " }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      ledger.setOpeningBalance({ ...base, amountPaise: 0, reason: "Zero" }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("joins the caller's transaction, so a rollback leaves no row and no audit", async () => {
    const { admin, customer } = await setup();

    await expect(
      runInTransaction(async (tx) => {
        await ledger.setOpeningBalance(
          {
            customerId: customer.id,
            direction: "pending",
            amountPaise: 5_000,
            reason: "Carried over",
            actorId: admin.id,
          },
          tx,
        );
        throw new Error("caller failed");
      }),
    ).rejects.toThrow("caller failed");

    expect(await ledger.getBalance(customer.id)).toEqual({
      balancePaise: 0,
      state: "settled",
      amountPaise: 0,
    });
    expect(await listAuditLogsForEntity("customer", customer.id)).toEqual([]);
  });
});

describe("Balance read", () => {
  it("reads the Balance as Pending, Advance or Settled", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 30_000 });

    expect(await ledger.getBalance(customer.id)).toMatchObject({ state: "settled" });
    await runInTransaction((tx) =>
      ledger.post(
        {
          entryType: "payment",
          paymentId: payment.id,
          customerId: customer.id,
          actorId: admin.id,
        },
        tx,
      ),
    );

    expect(await ledger.getBalance(customer.id)).toEqual({
      balancePaise: -30_000,
      state: "advance",
      amountPaise: 30_000,
    });
    const locked = await runInTransaction((tx) => ledger.lockBalance(customer.id, tx));
    expect(locked.state).toBe("advance");
  });

  it("treats a soft-deleted Customer as not found", async () => {
    const { admin } = await setup();
    const removed = await buildCustomer(admin.id);
    await db
      .update(customersTable)
      .set({ deletedAt: new Date() })
      .where(eq(customersTable.id, removed.id));

    await expect(ledger.getBalance(removed.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
