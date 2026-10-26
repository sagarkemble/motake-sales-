import { db, eq } from "@repo/database";
import {
  billsTable,
  billVersionsTable,
  customersTable,
  notesTable,
  paymentsTable,
  sellerSettingsTable,
  type SelectBill,
  type SelectBillItem,
  type SelectCustomer,
} from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import {
  buildBill,
  buildBillVersion,
  buildCustomer,
  buildNoteWithLines,
  buildPayment,
  buildPaymentEvent,
  buildProfile,
  buildRoute,
  buildSalesman,
  buildSellerSettings,
  buildVariety,
  type LineInput,
} from "../test/builders";
import { refusalOf } from "../errors";
import { MemoryDocumentStore, TEST_DOCUMENTS_BUCKET } from "../test/memory-document-store";
import { printedPages, printedText } from "../test/pdf-text";
import DocumentService from "./index";

function documentsWith(store: MemoryDocumentStore) {
  return new DocumentService(store);
}

// The machine reason a refused call carries, read the way the router error formatter reads it.
async function refusalFrom(call: Promise<unknown>): Promise<{ code: string; reason: unknown }> {
  try {
    await call;
  } catch (error) {
    return { code: (error as { code: string }).code, reason: refusalOf(error)?.reason };
  }
  throw new Error("Expected the call to be refused");
}

// The bucket and key a signed link points at, for either S3 addressing style.
function signedObjectOf(link: string): { bucket: string; key: string } {
  const url = new URL(link);
  const path = decodeURIComponent(url.pathname.slice(1));
  const hostBucket = url.hostname.split(".")[0]!;
  if (url.hostname.startsWith(`${TEST_DOCUMENTS_BUCKET}.`))
    return { bucket: hostBucket, key: path };
  const [bucket, ...key] = path.split("/");
  return { bucket: bucket!, key: key.join("/") };
}

async function versionsOf(billId: string) {
  return db
    .select()
    .from(billVersionsTable)
    .where(eq(billVersionsTable.billId, billId))
    .orderBy(billVersionsTable.versionNumber);
}

async function pdfKeyOf(billVersionId: string): Promise<string | null> {
  const [row] = await db
    .select({ pdfKey: billVersionsTable.pdfKey })
    .from(billVersionsTable)
    .where(eq(billVersionsTable.id, billVersionId));
  return row!.pdfKey;
}

async function recordIrn(bill: SelectBill, irn: string, recordedAt: Date) {
  await db
    .update(billsTable)
    .set({
      irn,
      irnAckNumber: "112610250012345",
      irnAckDate: "2026-10-26",
      signedQrText: `signed-qr-for-${irn}`,
      irnRecordedAt: recordedAt,
    })
    .where(eq(billsTable.id, bill.id));
}

// The file shares one database: the Seller master is set up once, Routes get unique names.
async function setup(customerOverrides: Partial<typeof customersTable.$inferInsert> = {}) {
  const admin = await buildProfile();
  const [seller] = await db.select().from(sellerSettingsTable);
  if (!seller) await buildSellerSettings(admin.id);
  const route = await buildRoute();
  const customer = await buildCustomer(admin.id, {
    routeId: route.id,
    shopName: "Laxmi Dairy",
    gstin: "27ABCDE1234F1Z5",
    ...customerOverrides,
  });
  const paneer = await buildVariety({ name: "Fresh Paneer 200 g", unit: "pack" });
  const milk = await buildVariety({ name: "Toned Milk 500 ml", unit: "pouch" });
  return { admin, route, customer, paneer, milk };
}

async function taxInvoiceOf(customer: SelectCustomer, actorId: string, lines: LineInput[]) {
  const { bill } = await buildBill({ customer, actorId, billDate: "2026-10-25", lines });
  const [version] = await versionsOf(bill.id);
  return { bill, version: version! };
}

describe("DocumentService.ensureBillVersionDocument", () => {
  it("draws a Bill version once, sets its key, and returns the same key without drawing again", async () => {
    const { admin, route, customer, paneer } = await setup();
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 10, routePricePaise: 9_000, hsn: "0406" },
    ]);
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const first = await documents.ensureBillVersionDocument(version.id, { bytes: true });
    const second = await documents.ensureBillVersionDocument(version.id);

    const expectedKey = `documents/bills/${bill.id}/v1.pdf`;
    expect(first.key).toBe(expectedKey);
    expect(first.filename).toBe(`Motake Bill ${bill.number.replaceAll("/", "-")}.pdf`);
    expect(second).toEqual({ key: expectedKey, filename: first.filename });
    expect(await pdfKeyOf(version.id)).toBe(expectedKey);
    expect(store.puts).toEqual([expectedKey]);
    expect(store.objects.get(expectedKey)?.contentType).toBe("application/pdf");

    const text = await printedText(first.bytes!);
    expect(text).toContain("Tax Invoice");
    expect(text).toContain(bill.number);
    expect(text).toContain("Laxmi Dairy");
    expect(text).toContain(`${route.name} (${route.code})`);
    expect(text).toContain("Maharashtra (27)");
    expect(text).toContain("Fresh Paneer 200 g");
    expect(text).toContain("₹945.00");
  });

  it("refuses an e-invoiced Tax Invoice without IRN and leaves pdf_key empty", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const store = new MemoryDocumentStore();

    const refusal = await refusalFrom(documentsWith(store).ensureBillVersionDocument(version.id));

    expect(refusal).toEqual({ code: "BAD_REQUEST", reason: "irn_missing" });
    expect(await pdfKeyOf(version.id)).toBeNull();
    expect(store.puts).toEqual([]);
  });

  it("draws the IRN key with the IRN block once the IRN is recorded", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const recordedAt = new Date("2026-10-26T06:30:00.000Z");
    await recordIrn(bill, "irn-0001-abcdef", recordedAt);

    const result = await documentsWith(new MemoryDocumentStore()).ensureBillVersionDocument(
      version.id,
      { bytes: true },
    );

    expect(result.key).toBe(`documents/bills/${bill.id}/v1-irn-${recordedAt.getTime()}.pdf`);
    expect(await pdfKeyOf(version.id)).toBe(result.key);
    const text = await printedText(result.bytes!);
    expect(text).toContain("irn-0001-abcdef");
    expect(text).toContain("112610250012345");
    expect(text).toContain("26/10/2026");
  });

  it("draws a Bill of Supply for an e-invoiced Customer without waiting for an IRN", async () => {
    const { admin, customer, milk } = await setup({ einvoicingRequired: true });
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: milk, quantity: 12, routePricePaise: 2_700, exempt: true },
    ]);

    const result = await documentsWith(new MemoryDocumentStore()).ensureBillVersionDocument(
      version.id,
      { bytes: true },
    );

    expect(result.key).toBe(`documents/bills/${bill.id}/v1.pdf`);
    const text = await printedText(result.bytes!);
    expect(text).toContain("Bill of Supply");
    expect(text).toContain("Exempt supply. No tax charged.");
  });

  it("ends two concurrent draws with one key", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 2, routePricePaise: 9_000 },
    ]);
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const [first, second] = await Promise.all([
      documents.ensureBillVersionDocument(version.id),
      documents.ensureBillVersionDocument(version.id),
    ]);

    const expectedKey = `documents/bills/${bill.id}/v1.pdf`;
    expect(first.key).toBe(expectedKey);
    expect(second.key).toBe(expectedKey);
    expect(await pdfKeyOf(version.id)).toBe(expectedKey);
    expect(new Set(store.puts)).toEqual(new Set([expectedKey]));
  });

  it("prints a version from its own snapshot after a later version and a Settings change", async () => {
    const { admin, customer, paneer, milk } = await setup();
    const { bill, version: v1 } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 10, routePricePaise: 9_000 },
    ]);
    await db
      .update(sellerSettingsTable)
      .set({ legalName: "Motake Renamed Foods LLP", address: "9 New Road, Sangli" });
    const v2 = await buildBillVersion({
      bill,
      actorId: admin.id,
      versionNumber: 2,
      lines: [{ variety: milk, quantity: 30, routePricePaise: 2_800, gstRateBps: 500 }],
      seller: {
        legal_name: "Motake Renamed Foods LLP",
        address: "9 New Road, Sangli",
        gstin: "27AAAAA0000A1Z5",
      },
    });
    const documents = documentsWith(new MemoryDocumentStore());

    const v1Text = await printedText(
      (await documents.ensureBillVersionDocument(v1.id, { bytes: true })).bytes!,
    );
    const v2Result = await documents.ensureBillVersionDocument(v2.id, { bytes: true });
    const v2Text = await printedText(v2Result.bytes!);

    expect(v1Text).toContain("Motake Test Foods Pvt Ltd");
    expect(v1Text).toContain("Fresh Paneer 200 g");
    expect(v1Text).not.toContain("Toned Milk 500 ml");
    expect(v1Text).not.toContain("Motake Renamed Foods LLP");
    expect(v1Text).not.toContain("Version");
    expect(v2Result.key).toBe(`documents/bills/${bill.id}/v2.pdf`);
    expect(v2Text).toContain("Motake Renamed Foods LLP");
    expect(v2Text).toContain("Toned Milk 500 ml");
    expect(v2Text).toMatch(/Version\s*2/);
  });

  it("refuses an unknown Bill version", async () => {
    const refusal = await refusalFrom(
      documentsWith(new MemoryDocumentStore()).ensureBillVersionDocument(
        "00000000-0000-4000-8000-000000000000",
      ),
    );

    expect(refusal).toEqual({ code: "NOT_FOUND", reason: "not_found" });
  });
});

describe("DocumentService.replaceBillDocumentAfterIrnCorrect", () => {
  it("draws under a new IRN key, replaces the latest key and keeps the old object", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const enteredAt = new Date("2026-10-26T06:30:00.000Z");
    await recordIrn(bill, "irn-first", enteredAt);
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);
    const entered = await documents.ensureBillVersionDocument(version.id);

    const correctedAt = new Date("2026-10-27T09:15:00.000Z");
    await recordIrn(bill, "irn-corrected", correctedAt);
    const corrected = await documents.replaceBillDocumentAfterIrnCorrect(bill.id, { bytes: true });

    expect(corrected.key).toBe(`documents/bills/${bill.id}/v1-irn-${correctedAt.getTime()}.pdf`);
    expect(corrected.key).not.toBe(entered.key);
    expect(await pdfKeyOf(version.id)).toBe(corrected.key);
    expect(store.objects.has(entered.key)).toBe(true);
    expect(store.objects.has(corrected.key)).toBe(true);
    const text = await printedText(corrected.bytes!);
    expect(text).toContain("irn-corrected");
    expect(text).not.toContain("irn-first");
  });

  it("is a no-op when the latest version already carries the current IRN key", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { bill } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    await recordIrn(bill, "irn-once", new Date("2026-10-26T06:30:00.000Z"));
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const first = await documents.replaceBillDocumentAfterIrnCorrect(bill.id);
    const retried = await documents.replaceBillDocumentAfterIrnCorrect(bill.id);

    expect(retried.key).toBe(first.key);
    expect(store.puts).toEqual([first.key]);
  });

  it("refuses a Bill with no IRN", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);

    const refusal = await refusalFrom(
      documentsWith(new MemoryDocumentStore()).replaceBillDocumentAfterIrnCorrect(bill.id),
    );

    expect(refusal).toEqual({ code: "BAD_REQUEST", reason: "irn_not_recorded" });
  });
});

describe("DocumentService.ensureNoteDocument", () => {
  it("sets a GST Credit Note key once and prints the buyer from the Bill version letterhead", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 10, routePricePaise: 9_000, hsn: "0406" },
    ]);
    const paneerLine = (version.items as SelectBillItem[])[0]!;
    const note = await buildNoteWithLines({
      bill,
      customer,
      actorId: admin.id,
      kind: "gst_credit_note",
      amountPaise: 37_800,
      number: "MC/26-27/000045",
      reason: "Paneer returned: seal broken",
      issuedOn: "2026-10-28",
      returnOrDamageOn: "2026-10-27",
      lines: [
        {
          billVersionId: version.id,
          snapshotLineId: paneerLine.id,
          quantity: 4,
          amountPaise: 36_000,
          cgstPaise: 900,
          sgstPaise: 900,
        },
      ],
    });
    // A later rename of the Customer never rewrites the Note paper.
    await db
      .update(customersTable)
      .set({ shopName: "Laxmi Dairy Renamed" })
      .where(eq(customersTable.id, customer.id));
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const first = await documents.ensureNoteDocument(note.id, { bytes: true });
    const second = await documents.ensureNoteDocument(note.id);

    expect(first.key).toBe(`documents/notes/${note.id}.pdf`);
    expect(first.filename).toBe("Motake Credit Note MC-26-27-000045.pdf");
    expect(second.key).toBe(first.key);
    expect(store.puts).toEqual([first.key]);
    const [stored] = await db.select().from(notesTable).where(eq(notesTable.id, note.id));
    expect(stored!.pdfKey).toBe(first.key);

    const text = await printedText(first.bytes!);
    expect(text).toContain("Credit Note");
    expect(text).toContain("MC/26-27/000045");
    expect(text).toContain("Laxmi Dairy");
    expect(text).not.toContain("Laxmi Dairy Renamed");
    expect(text).toContain(bill.number);
    expect(text).toContain("25/10/2026");
    expect(text).toContain("Paneer returned: seal broken");
    expect(text).toContain("27/10/2026");
    expect(text).toContain("₹9.00");
    expect(text).toContain("₹378.00");
  });

  it("prints a Commercial Credit Note without tax and with the does-not-reduce-GST line", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 10, routePricePaise: 9_000 },
    ]);
    const note = await buildNoteWithLines({
      bill,
      customer,
      actorId: admin.id,
      kind: "commercial_credit_note",
      amountPaise: 9_450,
      number: "MC/26-27/000046",
      reason: "Late discount",
      lines: [
        {
          billVersionId: version.id,
          snapshotLineId: (version.items as SelectBillItem[])[0]!.id,
          quantity: 1,
          amountPaise: 9_450,
        },
      ],
    });

    const result = await documentsWith(new MemoryDocumentStore()).ensureNoteDocument(note.id, {
      bytes: true,
    });

    expect(result.filename).toBe("Motake Credit Note MC-26-27-000046.pdf");
    const text = await printedText(result.bytes!);
    expect(text).toContain("Credit Note (Commercial)");
    expect(text).toContain("This Credit Note does not reduce GST. Not a GST Credit Note.");
    expect(text).toContain("₹94.50");
    expect(text).not.toMatch(/CGST|SGST|IGST/);
  });
});

describe("DocumentService.drawPaymentReceipt", () => {
  it("draws the receipt under a deterministic key and writes no column", async () => {
    const { admin, route, customer } = await setup();
    const payment = await buildPayment({
      customer,
      actorId: admin.id,
      keptPaise: 443_500,
      occurredAt: new Date("2026-10-25T13:12:00.000Z"),
      overrides: {
        number: "MP/26-27/000010",
        amountReceivedPaise: 500_000,
        amountReturnedPaise: 56_500,
      },
    });
    const posted = await buildPaymentEvent({ payment, actorId: admin.id });
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const result = await documents.drawPaymentReceipt(
      { paymentId: payment.id, postedPaymentEventId: posted.id, balanceAfterPaise: 125_050 },
      { bytes: true },
    );
    const retried = await documents.drawPaymentReceipt({
      paymentId: payment.id,
      postedPaymentEventId: posted.id,
      balanceAfterPaise: 125_050,
    });

    expect(result.key).toBe(`documents/receipts/${payment.id}/${posted.id}.pdf`);
    expect(result.filename).toBe("Motake Receipt MP-26-27-000010.pdf");
    expect(retried.key).toBe(result.key);
    expect(store.puts).toEqual([result.key]);
    const [paymentAfter] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, payment.id));
    expect(paymentAfter).toEqual(payment);

    const text = await printedText(result.bytes!);
    expect(text).toContain("Payment Receipt");
    expect(text).toContain("MP/26-27/000010");
    expect(text).toContain("25/10/2026 18:42");
    const [seller] = await db.select().from(sellerSettingsTable);
    expect(text).toContain(seller!.legalName);
    expect(text).toContain("Maharashtra (27)");
    expect(text).toContain("Laxmi Dairy");
    expect(text).toContain(`${route.name} (${route.code})`);
    expect(text).toContain("₹4,435.00");
    expect(text).toContain("Cash returned");
    expect(text).toContain("₹565.00");
    expect(text).toContain("Pending ₹1,250.50");
  });

  it("returns the stored receipt on a retry after a Payment Correct and a Settings edit", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({
      customer,
      actorId: admin.id,
      keptPaise: 443_500,
      overrides: { amountReceivedPaise: 500_000, amountReturnedPaise: 56_500 },
    });
    const posted = await buildPaymentEvent({ payment, actorId: admin.id });
    const [seller] = await db.select().from(sellerSettingsTable);
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);
    const input = { paymentId: payment.id, postedPaymentEventId: posted.id, balanceAfterPaise: 0 };

    const first = await documents.drawPaymentReceipt(input, { bytes: true });
    await db
      .update(paymentsTable)
      .set({ amountReceivedPaise: 400_000, amountKeptPaise: 400_000, amountReturnedPaise: 0 })
      .where(eq(paymentsTable.id, payment.id));
    await buildPaymentEvent({ payment, actorId: admin.id, kind: "adjusted", keptPaise: 400_000 });
    await db.update(sellerSettingsTable).set({ legalName: "Motake Receipt Renamed LLP" });
    const retried = await documents.drawPaymentReceipt(input, { bytes: true });

    expect(retried.key).toBe(first.key);
    expect(store.puts).toEqual([first.key]);
    expect(retried.bytes).toEqual(first.bytes);
    const text = await printedText(retried.bytes!);
    expect(text).toContain(seller!.legalName);
    expect(text).not.toContain("Motake Receipt Renamed LLP");
    expect(text).toContain("₹4,435.00");
    expect(text).toContain("₹565.00");
  });

  it("refuses an event that is not the posted event of that Payment, and a ₹0 kept", async () => {
    const { admin, customer } = await setup();
    const payment = await buildPayment({ customer, actorId: admin.id, keptPaise: 10_000 });
    await buildPaymentEvent({ payment, actorId: admin.id });
    const adjusted = await buildPaymentEvent({
      payment,
      actorId: admin.id,
      kind: "adjusted",
      keptPaise: 8_000,
    });
    const otherPayment = await buildPayment({ customer, actorId: admin.id, keptPaise: 5_000 });
    const otherPosted = await buildPaymentEvent({ payment: otherPayment, actorId: admin.id });
    const zeroPayment = await buildPayment({ customer, actorId: admin.id, keptPaise: 0 });
    const zeroPosted = await buildPaymentEvent({ payment: zeroPayment, actorId: admin.id });
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const adjustedRefusal = await refusalFrom(
      documents.drawPaymentReceipt({
        paymentId: payment.id,
        postedPaymentEventId: adjusted.id,
        balanceAfterPaise: 0,
      }),
    );
    const otherRefusal = await refusalFrom(
      documents.drawPaymentReceipt({
        paymentId: payment.id,
        postedPaymentEventId: otherPosted.id,
        balanceAfterPaise: 0,
      }),
    );
    const zeroRefusal = await refusalFrom(
      documents.drawPaymentReceipt({
        paymentId: zeroPayment.id,
        postedPaymentEventId: zeroPosted.id,
        balanceAfterPaise: 0,
      }),
    );

    expect(adjustedRefusal).toEqual({ code: "BAD_REQUEST", reason: "not_posted_event" });
    expect(otherRefusal).toEqual({ code: "BAD_REQUEST", reason: "not_posted_event" });
    expect(zeroRefusal).toEqual({ code: "BAD_REQUEST", reason: "nothing_kept" });
    expect(store.puts).toEqual([]);
  });
});

describe("DocumentService.drawDraftBill", () => {
  it("returns draft bytes marked on every page, with no put and no pdf_key", async () => {
    const { admin, customer } = await setup({ einvoicingRequired: true });
    const lines: LineInput[] = [];
    for (let index = 0; index < 45; index += 1) {
      lines.push({ variety: await buildVariety(), quantity: index + 1, routePricePaise: 9_000 });
    }
    const { bill } = await buildBill({ customer, actorId: admin.id, lines });
    const [version] = await versionsOf(bill.id);
    const store = new MemoryDocumentStore();

    const draft = await documentsWith(store).drawDraftBill(bill.id);

    expect(draft.filename).toBe(
      `Motake Bill ${bill.number.replaceAll("/", "-")} DRAFT-IRN-PENDING.pdf`,
    );
    expect(Object.keys(draft).sort()).toEqual(["bytes", "filename"]);
    const pages = await printedPages(draft.bytes);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page).toContain("Draft — IRN pending");
    expect(store.puts).toEqual([]);
    expect(await pdfKeyOf(version!.id)).toBeNull();
  });

  it("refuses a Bill that is not IRN pending", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);

    const refusal = await refusalFrom(
      documentsWith(new MemoryDocumentStore()).drawDraftBill(bill.id),
    );

    expect(refusal).toEqual({ code: "BAD_REQUEST", reason: "irn_not_pending" });
  });
});

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3]);

describe("DocumentService signed QR image", () => {
  it("stores a PNG and a JPEG under the signed-qr key with their content type, writing no column", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { bill } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const recordedAt = new Date("2026-10-26T06:30:00.000Z");
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);

    const png = await documents.putSignedQrImage({
      billId: bill.id,
      irnRecordedAt: recordedAt,
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    const jpeg = await documents.putSignedQrImage({
      billId: bill.id,
      irnRecordedAt: new Date(recordedAt.getTime() + 1_000),
      contentType: "image/jpeg",
      bytes: JPEG_BYTES,
    });

    expect(png.key).toBe(`documents/bills/${bill.id}/signed-qr-${recordedAt.getTime()}.png`);
    expect(jpeg.key).toBe(
      `documents/bills/${bill.id}/signed-qr-${recordedAt.getTime() + 1_000}.jpg`,
    );
    expect(store.objects.get(png.key)?.contentType).toBe("image/png");
    expect(store.objects.get(jpeg.key)?.contentType).toBe("image/jpeg");
    const [billAfter] = await db.select().from(billsTable).where(eq(billsTable.id, bill.id));
    expect(billAfter!.signedQrImageKey).toBeNull();
  });

  it("refuses a GIF and an image over 1 MB without storing anything", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);
    const oversized = new Uint8Array(1024 * 1024 + 1);
    oversized.set(PNG_BYTES);

    const gif = await refusalFrom(
      documents.putSignedQrImage({
        billId: bill.id,
        irnRecordedAt: new Date(),
        contentType: "image/gif",
        bytes: GIF_BYTES,
      }),
    );
    const gifNamedPng = await refusalFrom(
      documents.putSignedQrImage({
        billId: bill.id,
        irnRecordedAt: new Date(),
        contentType: "image/png",
        bytes: GIF_BYTES,
      }),
    );
    const large = await refusalFrom(
      documents.putSignedQrImage({
        billId: bill.id,
        irnRecordedAt: new Date(),
        contentType: "image/png",
        bytes: oversized,
      }),
    );

    expect(gif).toEqual({ code: "BAD_REQUEST", reason: "bad_image" });
    expect(gifNamedPng).toEqual({ code: "BAD_REQUEST", reason: "bad_image" });
    expect(large).toEqual({ code: "BAD_REQUEST", reason: "bad_image" });
    expect(store.puts).toEqual([]);
  });

  it("gives an Admin a 300-second inline link to the stored image, refuses a salesman and a Bill without image", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const salesman = await buildSalesman();
    const { bill } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const { bill: billWithoutImage } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 2, routePricePaise: 9_000 },
    ]);
    const store = new MemoryDocumentStore();
    const documents = documentsWith(store);
    const { key } = await documents.putSignedQrImage({
      billId: bill.id,
      irnRecordedAt: new Date("2026-10-26T06:30:00.000Z"),
      contentType: "image/png",
      bytes: PNG_BYTES,
    });
    await db.update(billsTable).set({ signedQrImageKey: key }).where(eq(billsTable.id, bill.id));

    const link = await documents.getSignedQrImageLink(admin.id, bill.id);
    const salesmanRefusal = await refusalFrom(
      documents.getSignedQrImageLink(salesman.profile.id, bill.id),
    );
    const missingRefusal = await refusalFrom(
      documents.getSignedQrImageLink(admin.id, billWithoutImage.id),
    );

    const url = new URL(link.url);
    expect(signedObjectOf(link.url)).toEqual({ bucket: TEST_DOCUMENTS_BUCKET, key });
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toBe("inline");
    expect(url.searchParams.get("response-content-type")).toBe("image/png");
    expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(290_000);
    expect(link.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    expect(salesmanRefusal).toEqual({ code: "FORBIDDEN", reason: "forbidden" });
    expect(missingRefusal).toEqual({ code: "NOT_FOUND", reason: "not_found" });
  });
});

describe("DocumentService.getDownloadLink", () => {
  it("draws a missing PDF and gives an Admin a 300-second attachment link with the file name", async () => {
    const { admin, customer, paneer } = await setup();
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);
    const store = new MemoryDocumentStore();

    const link = await documentsWith(store).getDownloadLink(admin.id, {
      billVersionId: version.id,
    });

    const key = `documents/bills/${bill.id}/v1.pdf`;
    const filename = `Motake Bill ${bill.number.replaceAll("/", "-")}.pdf`;
    expect(link.filename).toBe(filename);
    expect(await pdfKeyOf(version.id)).toBe(key);
    expect(store.puts).toEqual([key]);
    const url = new URL(link.url);
    expect(signedObjectOf(link.url)).toEqual({ bucket: TEST_DOCUMENTS_BUCKET, key });
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toContain(
      `attachment; filename="${filename}"`,
    );
    expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(290_000);
    expect(link.url).not.toContain("r2.dev");
  });

  it("opens an old Bill version and a Note, and refuses a salesman", async () => {
    const { admin, customer, paneer, milk } = await setup();
    const salesman = await buildSalesman();
    const { bill, version: v1 } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 3, routePricePaise: 9_000 },
    ]);
    await buildBillVersion({
      bill,
      actorId: admin.id,
      versionNumber: 2,
      lines: [{ variety: milk, quantity: 3, routePricePaise: 2_800 }],
    });
    const note = await buildNoteWithLines({
      bill,
      customer,
      actorId: admin.id,
      kind: "debit_note",
      amountPaise: 9_450,
      number: "MD/26-27/000007",
      lines: [
        {
          billVersionId: v1.id,
          snapshotLineId: (v1.items as SelectBillItem[])[0]!.id,
          quantity: 1,
          amountPaise: 9_000,
          cgstPaise: 225,
          sgstPaise: 225,
        },
      ],
    });
    const documents = documentsWith(new MemoryDocumentStore());

    const oldVersionLink = await documents.getDownloadLink(admin.id, { billVersionId: v1.id });
    const noteLink = await documents.getDownloadLink(admin.id, { noteId: note.id });
    const salesmanRefusal = await refusalFrom(
      documents.getDownloadLink(salesman.profile.id, { billVersionId: v1.id }),
    );

    expect(signedObjectOf(oldVersionLink.url)).toEqual({
      bucket: TEST_DOCUMENTS_BUCKET,
      key: `documents/bills/${bill.id}/v1.pdf`,
    });
    expect(noteLink.filename).toBe("Motake Debit Note MD-26-27-000007.pdf");
    expect(signedObjectOf(noteLink.url)).toEqual({
      bucket: TEST_DOCUMENTS_BUCKET,
      key: `documents/notes/${note.id}.pdf`,
    });
    expect(salesmanRefusal).toEqual({ code: "FORBIDDEN", reason: "forbidden" });
  });

  it("refuses while a Tax Invoice waits for its IRN, pointing to the Draft PDF", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);

    const call = documentsWith(new MemoryDocumentStore()).getDownloadLink(admin.id, {
      billVersionId: version.id,
    });

    await expect(call).rejects.toThrow(/Draft PDF/);
    expect(await refusalFrom(call)).toEqual({ code: "BAD_REQUEST", reason: "irn_missing" });
  });
});
