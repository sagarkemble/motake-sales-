import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { billItemsOf, notesOf, versionsOf } from "../test/admin-bill-world";
import type { CheckoutWorld } from "../test/builders";
import { buildMessageHarness, type MessageHarness } from "../test/customer-message-world";
import { wipeApplicationTables } from "../test/database";
import { buildEinvoicingWorld, irnFields, setBusinessDay } from "../test/gst-world";

// Spec J, Spec I's outcomes: an e-invoiced Bill is withheld until Enter IRN, sent again after
// Correct IRN, and a portal cancellation reaches J as Spec G's Bill cancelled outcome.

// Each case writes a Bill or Payment through the real services and then its messages; against a
// remote test database that is well past the 30 s default.
vi.setConfig({ testTimeout: 180_000 });

let harness: MessageHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  setBusinessDay("2026-10-25");
  harness = buildMessageHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

async function pendingBill(world: CheckoutWorld, receivedPaise = 0) {
  const placed = await harness.orderService.placeBookNow(world.salesman.id, {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    lines: [
      { sku: world.milk.sku, qty: 3 },
      { sku: world.curd.sku, qty: 1 },
    ],
    payment: { mode: "cash", receivedPaise },
  });
  return placed;
}

const kindsOf = (harness: MessageHarness) =>
  harness.gateway.instructions.map((instruction) => instruction.kind);

describe("IRN pending", () => {
  it("a Correct sends its GST Note now and withholds the Bill; Enter IRN sends one Bill, the latest version", async () => {
    const world = await buildEinvoicingWorld({ businessDate: "2026-10-25" });
    const placed = await pendingBill(world, 5_000);
    const milkLine = (await billItemsOf(placed.billId)).find(
      (item) => item.varietyId === world.milk.id,
    )!;
    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "One more Milk",
    });
    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 2,
      lines: [{ lineId: milkLine.id, quantity: 5 }],
      reason: "Another Milk",
    });
    // Receipt at checkout, a Debit Note at each Correct; no Bill and no Bill PDF yet.
    expect(kindsOf(harness)).toEqual(["receipt", "debit_note", "debit_note"]);
    expect(harness.documents.calls.map((call) => call.method)).toEqual([
      "drawPaymentReceipt",
      "ensureNoteDocument",
      "ensureNoteDocument",
    ]);

    const entered = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
    });

    const versions = await versionsOf(placed.billId);
    const ref = `bill/${placed.billId}/v3`;
    expect(harness.documents.calls.at(-1)).toEqual({
      method: "ensureBillVersionDocument",
      billVersionId: versions[2]!.id,
    });
    expect(harness.gateway.instructions.slice(3)).toEqual([
      expect.objectContaining({
        kind: "bill",
        businessRef: ref,
        idempotencyKey: `bill|${ref}|irn/${entered.irnRecordedAt.getTime()}`,
        values: expect.objectContaining({
          customer: `${world.customer.shopName}, ${world.route.name}`,
          bill_amount: "₹171.00",
          // The Balance at the Enter IRN commit: ₹171 Bill − ₹50 kept.
          balance_line: "बिलानंतरची बाकी रक्कम: ₹121.00",
        }),
        attachment: expect.objectContaining({
          key: `documents/bill-versions/${versions[2]!.id}.pdf`,
        }),
      }),
    ]);
  });

  it("Correct IRN replaces the PDF before the enqueue and sends the latest Bill again (new key, same ref), skipping the unsent one", async () => {
    const world = await buildEinvoicingWorld({ businessDate: "2026-10-25" });
    const placed = await pendingBill(world, 5_000);
    const entered = await harness.gstService.enterIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("1"),
    });
    const enteredRow = harness.gateway.rowByKey(
      `bill|bill/${placed.billId}/v1|irn/${entered.irnRecordedAt.getTime()}`,
    );
    vi.setSystemTime(new Date("2026-10-25T07:00:00Z"));

    const corrected = await harness.gstService.correctIrn(world.admin.id, {
      billId: placed.billId,
      ...irnFields("2"),
      reason: "Copied the wrong IRN",
    });

    expect(enteredRow).toMatchObject({ status: "skipped", skipReason: "superseded: newer Bill" });
    expect(harness.documents.calls.slice(-1)).toEqual([
      { method: "replaceBillDocumentAfterIrnCorrect", billId: placed.billId },
    ]);
    expect(kindsOf(harness)).toEqual(["receipt", "bill", "bill"]);
    expect(harness.gateway.instructions[2]).toMatchObject({
      businessRef: `bill/${placed.billId}/v1`,
      idempotencyKey: `bill|bill/${placed.billId}/v1|irn/${corrected.irnRecordedAt.getTime()}`,
      attachment: { key: `documents/bills/${placed.billId}/irn-1.pdf`, type: "pdf" },
    });
  });

  it("a portal cancellation skips the unsent Bill and sends the cancellation then the GST Credit Note", async () => {
    const world = await buildEinvoicingWorld({ businessDate: "2026-10-25" });
    const placed = await pendingBill(world);
    await harness.gstService.enterIrn(world.admin.id, { billId: placed.billId, ...irnFields("1") });

    await harness.gstService.recordPortalCancellation(world.admin.id, {
      billId: placed.billId,
      ackNumber: "CNL-0001",
      ackDate: "2026-10-25",
      reason: "Cancelled on the portal",
    });

    const [creditNote] = await notesOf(placed.billId);
    expect(harness.gateway.rows[0]).toMatchObject({ status: "skipped" });
    expect(harness.gateway.instructions.slice(1)).toEqual([
      expect.objectContaining({
        kind: "cancellation",
        businessRef: `bill/${placed.billId}/cancel`,
        values: expect.objectContaining({ reason: "Cancelled on the portal" }),
      }),
      expect.objectContaining({ kind: "credit_note", businessRef: `note/${creditNote!.id}` }),
    ]);
  });
});
