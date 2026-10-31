import { randomUUID } from "node:crypto";

import { db } from "@repo/database";
import { gatepassItemsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { billItemsOf, notesOf, versionsOf } from "../test/admin-bill-world";
import {
  buildCheckoutWorld,
  buildProduct,
  buildRoutePrice,
  buildVariety,
  buildVarietyTaxPeriod,
  type CheckoutWorld,
} from "../test/builders";
import { buildMessageHarness, type MessageHarness } from "../test/customer-message-world";
import { wipeApplicationTables } from "../test/database";
import { buildGstinWorld } from "../test/gst-world";

// Spec J, Spec G's outcomes: Raise Bill, Correct, Cancel and Raise Note.

const today = "2026-10-25";
// Each case writes a Bill or Payment through the real services and then its messages; against a
// remote test database that is well past the 30 s default.
vi.setConfig({ testTimeout: 180_000 });

let harness: MessageHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:00:00Z"));
  harness = buildMessageHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

// A Customer with a GSTIN (frozen on the Bill letterhead).
const gstinWorld = () => buildGstinWorld({ businessDate: today });

async function bookNow(world: CheckoutWorld, lines?: { sku: string; qty: number }[]) {
  const placed = await harness.orderService.placeBookNow(world.salesman.id, {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    lines: lines ?? [
      { sku: world.milk.sku, qty: 3 },
      { sku: world.curd.sku, qty: 1 },
    ],
    payment: { mode: "cash", receivedPaise: 0 },
  });
  const items = await billItemsOf(placed.billId);
  const milkLine = items.find((item) => item.varietyId === world.milk.id);
  const curdLine = items.find((item) => item.varietyId === world.curd.id);
  return { placed, items, milkLine: milkLine!, curdLine: curdLine! };
}

const kindsOf = (harness: MessageHarness) =>
  harness.gateway.instructions.map(
    (instruction) => `${instruction.kind}:${instruction.templateId}`,
  );

describe("Raise Bill", () => {
  it("sends the office Bill with its PDF", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });

    const raised = await harness.adminBillService.raiseBill(world.admin.id, {
      idempotencyKey: randomUUID(),
      customerId: world.customer.id,
      lines: [{ varietyId: world.milk.id, quantity: 3 }],
      reason: "Goods sent by office van",
    });

    expect(harness.gateway.instructions).toEqual([
      expect.objectContaining({
        kind: "bill",
        templateId: "motake_bill_v2",
        businessRef: `bill/${raised.billId}/v1`,
        idempotencyKey: `bill|bill/${raised.billId}/v1`,
        values: expect.objectContaining({
          bill_number: raised.billNumber,
          bill_amount: "₹79.00",
          balance_line: "बिलानंतरची बाकी रक्कम: ₹79.00",
        }),
        attachment: expect.objectContaining({ type: "pdf" }),
      }),
    ]);
    expect(harness.documents.calls).toEqual([
      { method: "ensureBillVersionDocument", billVersionId: raised.billVersionId },
    ]);
  });
});

describe("Correct", () => {
  it("a Correct sends Bill v2 (the new total) and skips the unsent v1", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await bookNow(world);
    const v1 = harness.gateway.rowByKey(`bill|bill/${placed.billId}/v1`);

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "One more Milk",
    });

    const versions = await versionsOf(placed.billId);
    expect(harness.gateway.instructions[1]).toEqual(
      expect.objectContaining({
        kind: "bill",
        businessRef: `bill/${placed.billId}/v2`,
        values: expect.objectContaining({
          customer: `${world.customer.shopName}, ${world.route.name}`,
          bill_amount: "₹145.00",
        }),
      }),
    );
    expect(harness.documents.calls).toContainEqual({
      method: "ensureBillVersionDocument",
      billVersionId: versions[1]!.id,
    });
    expect(v1).toMatchObject({ status: "skipped", skipReason: "superseded: newer Bill" });
    // The suppress ran before the v2 enqueue.
    const calls = harness.gateway.calls;
    expect(calls.indexOf(`suppress ${v1.notificationId}`)).toBeLessThan(
      calls.indexOf(`enqueue bill|bill/${placed.billId}/v2`),
    );
  });

  it("a v1 that already left stays in history", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await bookNow(world);
    const v1 = harness.gateway.rowByKey(`bill|bill/${placed.billId}/v1`);
    harness.gateway.setStatus(v1.notificationId, "pending", true);

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "One more Milk",
    });

    expect(v1.status).toBe("pending");
    expect(kindsOf(harness)).toEqual([
      "bill:motake_bill_v2",
      "bill:motake_bill_v2",
      "account_update:motake_bill_corrected_v2",
    ]);
  });

  it("an amount-up Correct for a GSTIN Customer sends Bill v2 then the GST Debit Note, no account update", async () => {
    const world = await gstinWorld();
    const { placed, milkLine } = await bookNow(world);

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "Shop took one\nmore Milk",
    });

    const [debitNote] = await notesOf(placed.billId);
    expect(kindsOf(harness).slice(1)).toEqual([
      "bill:motake_bill_v2",
      "debit_note:motake_gst_debit_note_v2",
    ]);
    expect(harness.gateway.instructions[2]).toEqual({
      idempotencyKey: `debit_note|note/${debitNote!.id}`,
      kind: "debit_note",
      to: expect.any(String),
      provider: "whatsapp",
      templateId: "motake_gst_debit_note_v2",
      language: "mr",
      values: {
        customer: `${world.customer.shopName}, ${world.route.name}`,
        route_name: world.route.name,
        note_number: "MD/26-27/000001",
        bill_number: placed.billNumber,
        reason: "Shop took one more Milk",
        additional_amount: "₹26.00",
        balance_line: "आता बाकी रक्कम: ₹145.00",
      },
      businessRef: `note/${debitNote!.id}`,
      attachment: {
        key: `documents/notes/${debitNote!.id}.pdf`,
        type: "pdf",
        filename: "Motake Debit Note MD-26-27-000001.pdf",
      },
    });
    expect(harness.documents.calls.at(-1)).toEqual({
      method: "ensureNoteDocument",
      noteId: debitNote!.id,
    });
  });

  it("an amount-up Correct without GSTIN sends Bill v2 then the Bill corrected update", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await bookNow(world);

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 4 }],
      reason: "Shop took one more Milk",
    });

    expect(harness.gateway.instructions.slice(1)).toEqual([
      expect.objectContaining({ kind: "bill", businessRef: `bill/${placed.billId}/v2` }),
      {
        idempotencyKey: `account_update|bill/${placed.billId}/v2`,
        kind: "account_update",
        to: expect.any(String),
        provider: "whatsapp",
        templateId: "motake_bill_corrected_v2",
        language: "mr",
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          bill_number: placed.billNumber,
          reason: "Shop took one more Milk",
          balance_adjustment: "₹26.00 ने वाढ",
          balance_line: "आता बाकी रक्कम: ₹145.00",
        },
        businessRef: `bill/${placed.billId}/v2`,
      },
    ]);
  });

  it("an amount-down Correct after the GST deadline (Commercial) sends Bill v2 and the update, no Note message", async () => {
    const world = await gstinWorld();
    const { placed, milkLine } = await bookNow(world);
    vi.setSystemTime(new Date("2027-12-01T06:00:00Z"));

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [{ lineId: milkLine.id, quantity: 2 }],
      reason: "One Milk returned",
    });

    expect(kindsOf(harness).slice(1)).toEqual([
      "bill:motake_bill_v2",
      "account_update:motake_bill_corrected_v2",
    ]);
    expect(harness.gateway.instructions[2]!.values).toMatchObject({
      balance_adjustment: "₹27.00 ने घट",
      balance_line: "आता बाकी रक्कम: ₹92.00",
    });
    expect(harness.documents.calls.map((call) => call.method)).not.toContain("ensureNoteDocument");
  });

  it("a same-total Correct that moves tax facts sends Bill v2 and both GST Notes in number order, no update", async () => {
    const world = await gstinWorld();
    const product = await buildProduct({ name: "Gokul Buttermilk" });
    const buttermilk = await buildVariety({
      productId: product.id,
      name: "Buttermilk",
      unit: "cup",
    });
    await buildRoutePrice(world.route.id, buttermilk.id, 4_000);
    await buildVarietyTaxPeriod(buttermilk.id, { hsn: "0403", exempt: true, gstRateBps: 0 });
    await db
      .insert(gatepassItemsTable)
      .values({ gatepassId: world.gatepass.id, varietyId: buttermilk.id, issuedQty: 10 });
    const { placed, items, curdLine } = await bookNow(world, [
      { sku: world.curd.sku, qty: 1 },
      { sku: buttermilk.sku, qty: 2 },
    ]);
    const buttermilkLine = items.find((item) => item.varietyId === buttermilk.id)!;

    await harness.adminBillService.correctBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      lines: [
        { lineId: curdLine.id, quantity: 2 },
        { lineId: buttermilkLine.id, quantity: 1 },
      ],
      reason: "Curd and Buttermilk swapped",
    });

    expect(kindsOf(harness).slice(1)).toEqual([
      "bill:motake_bill_v2",
      "credit_note:motake_gst_credit_note_v2",
      "debit_note:motake_gst_debit_note_v2",
    ]);
    expect(harness.gateway.instructions[2]!.values).toMatchObject({
      note_number: "MC/26-27/000001",
      credit_amount: "₹40.00",
      balance_line: "आता बाकी रक्कम: ₹120.00",
    });
  });
});

describe("Cancel", () => {
  it("skips the unsent Bill, sends the cancellation then the GST Credit Note, never an account update", async () => {
    const world = await gstinWorld();
    const { placed } = await bookNow(world);
    const v1 = harness.gateway.rowByKey(`bill|bill/${placed.billId}/v1`);

    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Cancelled before\n\tdelivery",
    });

    const [creditNote] = await notesOf(placed.billId);
    expect(v1).toMatchObject({ status: "skipped", skipReason: "superseded: cancelled" });
    expect(harness.gateway.instructions.slice(1)).toEqual([
      {
        idempotencyKey: `cancellation|bill/${placed.billId}/cancel`,
        kind: "cancellation",
        to: expect.any(String),
        provider: "whatsapp",
        templateId: "motake_cancellation_v2",
        language: "mr",
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          bill_number: placed.billNumber,
          reason: "Cancelled before delivery",
          amount_reversed: "₹119.00",
          balance_line: "बाकी रक्कम: ₹0.00",
        },
        businessRef: `bill/${placed.billId}/cancel`,
      },
      expect.objectContaining({
        kind: "credit_note",
        templateId: "motake_gst_credit_note_v2",
        businessRef: `note/${creditNote!.id}`,
        values: expect.objectContaining({
          note_number: creditNote!.number,
          credit_amount: "₹119.00",
          reason: "Cancelled before delivery",
        }),
        attachment: expect.objectContaining({
          filename: `Motake Credit Note ${creditNote!.number.replaceAll("/", "-")}.pdf`,
        }),
      }),
    ]);
  });

  it("without GSTIN sends only the cancellation", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed } = await bookNow(world);

    await harness.adminBillService.cancelBill(world.admin.id, {
      billId: placed.billId,
      expectedVersionNumber: 1,
      reason: "Wrong shop",
    });

    expect(kindsOf(harness).slice(1)).toEqual(["cancellation:motake_cancellation_v2"]);
  });
});

describe("Raise Note", () => {
  it("a GST Credit Note to a GSTIN Customer sends only the statutory Note with its PDF", async () => {
    const world = await gstinWorld();
    const { placed, milkLine } = await bookNow(world);

    const raised = await harness.adminBillService.raiseNote(world.admin.id, {
      idempotencyKey: randomUUID(),
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "gst_credit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "One Milk returned leaking",
      returnOrDamageOn: "2026-10-24",
    });

    expect(harness.gateway.instructions.slice(1)).toEqual([
      expect.objectContaining({
        kind: "credit_note",
        idempotencyKey: `credit_note|note/${raised.noteId}`,
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          note_number: "MC/26-27/000001",
          bill_number: placed.billNumber,
          reason: "One Milk returned leaking",
          credit_amount: "₹26.23",
          balance_line: "आता बाकी रक्कम: ₹92.77",
        },
      }),
    ]);
  });

  it("a Commercial Credit Note to a GSTIN Customer sends the Note update, no PDF", async () => {
    const world = await gstinWorld();
    const { placed, curdLine } = await bookNow(world);

    const raised = await harness.adminBillService.raiseNote(world.admin.id, {
      idempotencyKey: randomUUID(),
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "commercial_credit_note",
      lines: [{ lineId: curdLine.id, quantity: 1 }],
      reason: "Goodwill discount",
    });

    expect(harness.gateway.instructions.slice(1)).toEqual([
      {
        idempotencyKey: `account_update|note/${raised.noteId}`,
        kind: "account_update",
        to: expect.any(String),
        provider: "whatsapp",
        templateId: "motake_note_update_v2",
        language: "mr",
        values: {
          customer: `${world.customer.shopName}, ${world.route.name}`,
          route_name: world.route.name,
          note_number: "MC/26-27/000001",
          bill_number: placed.billNumber,
          status: "क्रेडिट नोट दिली",
          reason: "Goodwill discount",
          balance_adjustment: "₹40.00 ने घट",
          balance_line: "आता बाकी रक्कम: ₹79.00",
        },
        businessRef: `note/${raised.noteId}`,
      },
    ]);
    expect(harness.documents.calls.map((call) => call.method)).not.toContain("ensureNoteDocument");
  });

  it("a GST Debit Note to a Customer without GSTIN sends the Note update", async () => {
    const world = await buildCheckoutWorld({ businessDate: today });
    const { placed, milkLine } = await bookNow(world);

    await harness.adminBillService.raiseNote(world.admin.id, {
      idempotencyKey: randomUUID(),
      billId: placed.billId,
      expectedVersionNumber: 1,
      kind: "debit_note",
      lines: [{ lineId: milkLine.id, quantity: 1 }],
      reason: "One Milk short-billed",
    });

    expect(kindsOf(harness).slice(1)).toEqual(["account_update:motake_note_update_v2"]);
    expect(harness.gateway.instructions[1]!.values).toMatchObject({
      status: "डेबिट नोट दिली",
      balance_adjustment: "₹26.23 ने वाढ",
    });
  });
});
