import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import {
  customersTable,
  ledgerEntriesTable,
  notesTable,
  paymentsTable,
  type SelectCustomer,
  type SelectNote,
} from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import {
  buildBill,
  buildCustomer,
  buildGatepass,
  buildNote,
  buildOrder,
  buildPayment,
  buildProfile,
  buildRefund,
  buildSalesman,
  buildVariety,
} from "../test/builders";
import DocumentNumberService from "../document-numbers";
import { checkoutRefusalOf } from "../errors";
import LedgerService, { type PostInput } from "./index";

const ledger = new LedgerService();
const numbers = new DocumentNumberService();

const post = (input: PostInput) => runInTransaction((tx) => ledger.post(input, tx));

async function setup() {
  const admin = await buildProfile();
  const customer = await buildCustomer(admin.id);
  const variety = await buildVariety();
  return { admin, customer, variety };
}

// An exempt one-line Bill whose total is exactly `rupees`, with no Ledger debit yet.
async function billOf(
  customer: SelectCustomer,
  actorId: string,
  rupees: number,
  orderId: string | null = null,
) {
  const variety = await buildVariety();
  const { bill } = await buildBill({
    customer,
    actorId,
    orderId,
    skipLedgerDebit: true,
    lines: [{ variety, quantity: 1, routePricePaise: rupees * 100, exempt: true }],
  });
  return bill;
}

async function balanceOf(customerId: string) {
  const [row] = await db
    .select({ balancePaise: customersTable.balancePaise })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));
  return row!.balancePaise;
}

async function ledgerRows(customerId: string) {
  return db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.customerId, customerId));
}

// Inserts the Note with a pre-generated Ledger row id, then posts it, in one transaction.
async function postNote(
  billInput: Parameters<typeof buildNote>[1]["bill"],
  customerId: string,
  actorId: string,
  kind: SelectNote["kind"],
  amountPaise: number,
  entryType?: "credit_note" | "debit_note",
) {
  return runInTransaction(async (tx) => {
    const note = await buildNote(tx, {
      bill: billInput,
      kind,
      amountPaise,
      ledgerEntryId: randomUUID(),
    });
    const result = await ledger.post(
      {
        entryType: entryType ?? (kind === "debit_note" ? "debit_note" : "credit_note"),
        noteId: note.id,
        customerId,
        actorId,
      },
      tx,
    );
    return { note, result };
  });
}

describe("LedgerService.post sides and amounts", () => {
  it("debits a Bill in full and links only the Bill", async () => {
    const { admin, customer } = await setup();
    const bill = await billOf(customer, admin.id, 2_000);

    const result = await post({
      entryType: "bill",
      billId: bill.id,
      customerId: customer.id,
      actorId: admin.id,
    });

    expect(result).toMatchObject({
      entryType: "bill",
      side: "debit",
      amountPaise: 200_000,
      balanceBeforePaise: 0,
      balanceAfterPaise: 200_000,
    });
    const [row] = await ledgerRows(customer.id);
    expect(row).toMatchObject({
      id: result.entryId,
      billId: bill.id,
      paymentId: null,
      noteId: null,
      refundId: null,
      gatepassId: null,
      actorId: admin.id,
    });
    expect(await balanceOf(customer.id)).toBe(200_000);
  });

  it("credits only the kept amount of a Payment", async () => {
    const { admin, customer } = await setup();
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        customerId: customer.id,
        mode: "cash",
        amountReceivedPaise: 120_000,
        amountKeptPaise: 100_000,
        amountReturnedPaise: 20_000,
        number: "TP/26-27/900001",
        actorId: admin.id,
        occurredAt: new Date(),
        idempotencyKey: randomUUID(),
      })
      .returning();

    const result = await post({
      entryType: "payment",
      paymentId: payment!.id,
      customerId: customer.id,
      actorId: admin.id,
    });

    expect(result).toMatchObject({
      side: "credit",
      amountPaise: 100_000,
      balanceAfterPaise: -100_000,
    });
  });

  it("credits GST and Commercial Credit Notes and debits a Debit Note, copying the Note reason", async () => {
    const { admin, customer } = await setup();
    const bill = await billOf(customer, admin.id, 1_000);
    await post({ entryType: "bill", billId: bill.id, customerId: customer.id, actorId: admin.id });

    const gst = await postNote(bill, customer.id, admin.id, "gst_credit_note", 10_000);
    const commercial = await postNote(bill, customer.id, admin.id, "commercial_credit_note", 5_000);
    const debit = await postNote(bill, customer.id, admin.id, "debit_note", 2_000);

    expect(gst.result).toMatchObject({
      entryType: "credit_note",
      side: "credit",
      amountPaise: 10_000,
    });
    expect(commercial.result).toMatchObject({ entryType: "credit_note", side: "credit" });
    expect(debit.result).toMatchObject({
      entryType: "debit_note",
      side: "debit",
      balanceAfterPaise: 100_000 - 10_000 - 5_000 + 2_000,
    });
    const [noteRow] = await ledgerRows(customer.id).then((rows) =>
      rows.filter((row) => row.id === gst.note.ledgerEntryId),
    );
    expect(noteRow).toMatchObject({ noteId: gst.note.id, reason: "Damaged in transit" });
  });

  it("debits a Refund and copies its reason", async () => {
    const { admin, customer } = await setup();
    await post({
      entryType: "payment",
      paymentId: (await buildPayment({ customer, actorId: admin.id, keptPaise: 50_000 })).id,
      customerId: customer.id,
      actorId: admin.id,
    });
    const refund = await buildRefund({ customer, actorId: admin.id, amountPaise: 20_000 });

    const result = await post({
      entryType: "refund",
      refundId: refund.id,
      customerId: customer.id,
      actorId: admin.id,
    });

    expect(result).toMatchObject({
      side: "debit",
      amountPaise: 20_000,
      balanceAfterPaise: -30_000,
    });
    const rows = await ledgerRows(customer.id);
    expect(rows.find((row) => row.refundId === refund.id)?.reason).toBe("Advance paid back");
  });

  it("posts a Payment adjustment as a Credit when kept goes up and a Debit when it goes down", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 50_000 });
    await post({
      entryType: "payment",
      paymentId: payment.id,
      customerId: customer.id,
      actorId: admin.id,
    });
    const correctionDay = new Date("2026-11-02T06:00:00Z");

    const up = await post({
      entryType: "payment_adjusted",
      paymentId: payment.id,
      differencePaise: 10_000,
      reason: "Typed ₹500 instead of ₹600",
      occurredAt: correctionDay,
      customerId: customer.id,
      actorId: admin.id,
    });
    const down = await post({
      entryType: "payment_adjusted",
      paymentId: payment.id,
      differencePaise: -4_000,
      reason: "Counted again",
      customerId: customer.id,
      actorId: admin.id,
    });

    expect(up).toMatchObject({ side: "credit", amountPaise: 10_000, balanceAfterPaise: -60_000 });
    expect(up.occurredAt).toEqual(correctionDay);
    expect(down).toMatchObject({ side: "debit", amountPaise: 4_000, balanceAfterPaise: -56_000 });
  });

  it("posts a Refund adjustment as a Debit when it goes up and a Credit when it goes down", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 50_000 });
    await post({
      entryType: "payment",
      paymentId: payment.id,
      customerId: customer.id,
      actorId: admin.id,
    });
    const refund = await buildRefund({ customer, actorId: admin.id, amountPaise: 20_000 });
    await post({
      entryType: "refund",
      refundId: refund.id,
      customerId: customer.id,
      actorId: admin.id,
    });

    const up = await post({
      entryType: "refund_adjusted",
      refundId: refund.id,
      differencePaise: 5_000,
      reason: "Paid ₹50 more",
      customerId: customer.id,
      actorId: admin.id,
    });
    const down = await post({
      entryType: "refund_adjusted",
      refundId: refund.id,
      differencePaise: -15_000,
      reason: "Bank reversed part",
      customerId: customer.id,
      actorId: admin.id,
    });

    expect(up).toMatchObject({ side: "debit", amountPaise: 5_000, balanceAfterPaise: -25_000 });
    expect(down).toMatchObject({ side: "credit", amountPaise: 15_000, balanceAfterPaise: -40_000 });
  });

  it("stores the salesman's GatePass when given and leaves it empty for office work", async () => {
    const { admin, customer, variety } = await setup();
    const salesman = await buildSalesman();
    const gatepass = await buildGatepass({
      salesmanId: salesman.profile.id,
      issuedBy: admin.id,
      routeId: customer.routeId,
      lines: [{ varietyId: variety.id, issuedQty: 10 }],
    });
    const bill = await billOf(customer, admin.id, 100);

    await post({
      entryType: "bill",
      billId: bill.id,
      customerId: customer.id,
      actorId: salesman.profile.id,
      gatepassId: gatepass.id,
    });

    const [row] = await ledgerRows(customer.id);
    expect(row).toMatchObject({ gatepassId: gatepass.id, actorId: salesman.profile.id });
  });
});

describe("LedgerService.post refusals", () => {
  it("refuses a zero amount: a ₹0 kept Payment or a zero adjustment", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 0 });

    await expect(
      post({
        entryType: "payment",
        paymentId: payment.id,
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      post({
        entryType: "payment_adjusted",
        paymentId: payment.id,
        differencePaise: 0,
        reason: "No change",
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(await ledgerRows(customer.id)).toEqual([]);
  });

  it("refuses a missing paper, and rejects a missing reason or a fractional amount as invalid input", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 1_000 });

    await expect(
      post({ entryType: "bill", billId: randomUUID(), customerId: customer.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      post({
        entryType: "payment_adjusted",
        paymentId: payment.id,
        differencePaise: 100,
        reason: "  ",
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      post({
        entryType: "payment_adjusted",
        paymentId: payment.id,
        differencePaise: 10.5,
        reason: "Half a paisa",
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("refuses a paper that belongs to another Customer", async () => {
    const { admin, customer } = await setup();
    const other = await buildCustomer(admin.id);
    const payment = await buildPayment({ customer: other, actorId: admin.id, keptPaise: 1_000 });
    const { order } = await buildOrder({
      customer: other,
      actorId: admin.id,
      lines: [{ variety: await buildVariety(), quantity: 1, routePricePaise: 1_000 }],
    });
    const orderBill = await billOf(other, admin.id, 10, order.id);

    await expect(
      post({
        entryType: "payment",
        paymentId: payment.id,
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      post({ entryType: "bill", billId: orderBill.id, customerId: customer.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a Note on a Bill debited to another Customer", async () => {
    const { admin, customer } = await setup();
    const other = await buildCustomer(admin.id);
    const officeBill = await billOf(other, admin.id, 100);
    await post({
      entryType: "bill",
      billId: officeBill.id,
      customerId: other.id,
      actorId: admin.id,
    });

    await expect(
      postNote(officeBill, customer.id, admin.id, "gst_credit_note", 1_000),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a second Bill debit and a second Ledger row for one Note", async () => {
    const { admin, customer } = await setup();
    const bill = await billOf(customer, admin.id, 100);
    await post({ entryType: "bill", billId: bill.id, customerId: customer.id, actorId: admin.id });

    await expect(
      post({ entryType: "bill", billId: bill.id, customerId: customer.id, actorId: admin.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const { note } = await postNote(bill, customer.id, admin.id, "gst_credit_note", 1_000);
    await expect(
      post({
        entryType: "credit_note",
        noteId: note.id,
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await balanceOf(customer.id)).toBe(10_000 - 1_000);
  });

  it("refuses a second post of one Payment or one Refund, even two at once", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 10_000 });
    const postPayment = () =>
      post({
        entryType: "payment",
        paymentId: payment.id,
        customerId: customer.id,
        actorId: admin.id,
      });

    const outcomes = await Promise.allSettled([postPayment(), postPayment()]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);

    const refund = await buildRefund({ customer, actorId: admin.id, amountPaise: 4_000 });
    const postRefund = () =>
      post({
        entryType: "refund",
        refundId: refund.id,
        customerId: customer.id,
        actorId: admin.id,
      });
    await postRefund();
    await expect(postRefund()).rejects.toMatchObject({ code: "CONFLICT" });
    // Adjustments are separate rows and still allowed after the first post.
    await post({
      entryType: "payment_adjusted",
      paymentId: payment.id,
      differencePaise: 500,
      reason: "Counted again",
      customerId: customer.id,
      actorId: admin.id,
    });
    expect(await balanceOf(customer.id)).toBe(-10_000 + 4_000 - 500);
  });

  it("refuses a Note posted as the wrong type", async () => {
    const { admin, customer } = await setup();
    const bill = await billOf(customer, admin.id, 100);
    await post({ entryType: "bill", billId: bill.id, customerId: customer.id, actorId: admin.id });

    await expect(
      postNote(bill, customer.id, admin.id, "debit_note", 1_000, "credit_note"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a deactivated Customer, soft-deleted or Inactive, as customer_inactive", async () => {
    const { admin, customer } = await setup();
    const removed = await buildCustomer(admin.id);
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 1_000 });
    const removedPayment = await buildPayment({
      customer: removed,
      actorId: admin.id,
      keptPaise: 1_000,
    });
    await db
      .update(customersTable)
      .set({ status: "inactive" })
      .where(eq(customersTable.id, customer.id));
    await db
      .update(customersTable)
      .set({ deletedAt: new Date() })
      .where(eq(customersTable.id, removed.id));

    for (const [customerId, paymentId] of [
      [customer.id, payment.id],
      [removed.id, removedPayment.id],
    ] as const) {
      const refused = await post({
        entryType: "payment",
        paymentId,
        customerId,
        actorId: admin.id,
      }).catch((caught: unknown) => caught);
      expect(checkoutRefusalOf(refused)).toMatchObject({ reason: "customer_inactive" });
    }
    expect(await ledgerRows(customer.id)).toHaveLength(0);
    expect(await ledgerRows(removed.id)).toHaveLength(0);
  });

  it("refuses a Refund, or a bigger Refund, past the Customer's Advance", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 10_000 });
    await post({
      entryType: "payment",
      paymentId: payment.id,
      customerId: customer.id,
      actorId: admin.id,
    });
    const tooBig = await buildRefund({ customer, actorId: admin.id, amountPaise: 10_001 });
    const exact = await buildRefund({ customer, actorId: admin.id, amountPaise: 10_000 });

    await expect(
      post({
        entryType: "refund",
        refundId: tooBig.id,
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await post({
      entryType: "refund",
      refundId: exact.id,
      customerId: customer.id,
      actorId: admin.id,
    });
    await expect(
      post({
        entryType: "refund_adjusted",
        refundId: exact.id,
        differencePaise: 1,
        reason: "One paisa more",
        customerId: customer.id,
        actorId: admin.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await balanceOf(customer.id)).toBe(0);
  });

  it("lets only one of two Refunds at once take the same Advance", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 10_000 });
    await post({
      entryType: "payment",
      paymentId: payment.id,
      customerId: customer.id,
      actorId: admin.id,
    });
    const first = await buildRefund({ customer, actorId: admin.id, amountPaise: 8_000 });
    const second = await buildRefund({ customer, actorId: admin.id, amountPaise: 8_000 });

    const outcomes = await Promise.allSettled(
      [first, second].map((refund) =>
        post({
          entryType: "refund",
          refundId: refund.id,
          customerId: customer.id,
          actorId: admin.id,
        }),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await balanceOf(customer.id)).toBe(-2_000);
  });
});

describe("LedgerService.post transactions", () => {
  it("commits a Note and its Ledger row together, and a rollback leaves neither", async () => {
    const { admin, customer } = await setup();
    const bill = await billOf(customer, admin.id, 100);
    await post({ entryType: "bill", billId: bill.id, customerId: customer.id, actorId: admin.id });

    await expect(
      runInTransaction(async (tx) => {
        const note = await buildNote(tx, {
          bill,
          kind: "gst_credit_note",
          amountPaise: 1_000,
          ledgerEntryId: randomUUID(),
        });
        await ledger.post(
          {
            entryType: "credit_note",
            noteId: note.id,
            customerId: customer.id,
            actorId: admin.id,
          },
          tx,
        );
        throw new Error("caller failed after posting");
      }),
    ).rejects.toThrow("caller failed after posting");

    expect(await db.select().from(notesTable).where(eq(notesTable.billId, bill.id))).toEqual([]);
    expect(await ledgerRows(customer.id)).toHaveLength(1);
    expect(await balanceOf(customer.id)).toBe(10_000);
  });

  it("gives back the number, Ledger row and Balance when a post is refused after allocation", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 5_000 });
    const tooBig = await buildRefund({ customer, actorId: admin.id, amountPaise: 9_000 });
    await post({
      entryType: "payment",
      paymentId: payment.id,
      customerId: customer.id,
      actorId: admin.id,
    });

    await expect(
      runInTransaction(async (tx) => {
        await numbers.allocate({ kind: "refund", financialYear: "26-27", actorId: admin.id }, tx);
        await ledger.post(
          {
            entryType: "refund",
            refundId: tooBig.id,
            customerId: customer.id,
            actorId: admin.id,
          },
          tx,
        );
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const [refundSeries] = (await numbers.getSeries("26-27")).filter(
      (entry) => entry.kind === "refund",
    );
    expect(refundSeries).toMatchObject({ nextSeq: 1, frozen: false });
    expect(await ledgerRows(customer.id)).toHaveLength(1);
    expect(await balanceOf(customer.id)).toBe(-5_000);
  });

  it("ends with stored Balance equal to the Ledger sum after parallel posts", async () => {
    const { admin, customer } = await setup();
    const payments = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        buildPayment({ customer, actorId: admin.id, keptPaise: 1_000 * (index + 1) }),
      ),
    );
    const bills = await Promise.all([
      billOf(customer, admin.id, 50),
      billOf(customer, admin.id, 70),
    ]);

    await Promise.all([
      ...payments.map((payment) =>
        post({
          entryType: "payment",
          paymentId: payment.id,
          customerId: customer.id,
          actorId: admin.id,
        }),
      ),
      ...bills.map((bill) =>
        post({ entryType: "bill", billId: bill.id, customerId: customer.id, actorId: admin.id }),
      ),
    ]);

    expect(await balanceOf(customer.id)).toBe(12_000 - 21_000);
    expect(await ledgerRows(customer.id)).toHaveLength(8);
  });
});

describe("ADR-0002 checkout flows", () => {
  async function flow(openingPaise: number) {
    const { admin, customer } = await setup();
    if (openingPaise !== 0) {
      await ledger.setOpeningBalance({
        customerId: customer.id,
        direction: openingPaise > 0 ? "pending" : "advance",
        amountPaise: Math.abs(openingPaise),
        reason: "Carried over",
        actorId: admin.id,
      });
    }
    const bill = async (rupees: number) =>
      post({
        entryType: "bill",
        billId: (await billOf(customer, admin.id, rupees)).id,
        customerId: customer.id,
        actorId: admin.id,
      });
    const pay = async (keptRupees: number) =>
      post({
        entryType: "payment",
        paymentId: (
          await buildPayment({ customer, actorId: admin.id, keptPaise: keptRupees * 100 })
        ).id,
        customerId: customer.id,
        actorId: admin.id,
      });
    return { bill, pay, balance: () => balanceOf(customer.id) };
  }

  it("1. pays in full → ₹0", async () => {
    const { bill, pay, balance } = await flow(0);
    await bill(2_000);
    await pay(2_000);
    expect(await balance()).toBe(0);
  });

  it("2. pays part → ₹5,000 pending", async () => {
    const { bill, pay, balance } = await flow(0);
    await bill(10_000);
    await pay(5_000);
    expect(await balance()).toBe(500_000);
  });

  it("3. pays nothing → ₹3,000 pending", async () => {
    const { bill, balance } = await flow(0);
    await bill(3_000);
    expect(await balance()).toBe(300_000);
  });

  it("4. old pending, new Bill, part pay → Bill first to ₹10,000, then ₹8,000", async () => {
    const { bill, pay, balance } = await flow(700_000);
    const billed = await bill(3_000);
    const paid = await pay(2_000);
    expect(billed.balanceAfterPaise).toBe(1_000_000);
    expect(paid.balanceAfterPaise).toBe(800_000);
    expect(await balance()).toBe(800_000);
  });

  it("5. overpays with change returned → only ₹1,000 kept → ₹0", async () => {
    const { pay, balance } = await flow(100_000);
    await pay(1_000);
    expect(await balance()).toBe(0);
  });

  it("6. overpays and keeps it as Advance → −₹200", async () => {
    const { pay, balance } = await flow(100_000);
    await pay(1_200);
    expect(await balance()).toBe(-20_000);
  });

  it("7. Bill while in Advance → ₹3,000 pending, then ₹4,000 kept → −₹1,000", async () => {
    const { bill, pay, balance } = await flow(-200_000);
    const billed = await bill(5_000);
    await pay(4_000);
    expect(billed.balanceAfterPaise).toBe(300_000);
    expect(await balance()).toBe(-100_000);
  });

  it("8. Bill exactly equals Advance → ₹0", async () => {
    const { bill, balance } = await flow(-300_000);
    await bill(3_000);
    expect(await balance()).toBe(0);
  });
});
