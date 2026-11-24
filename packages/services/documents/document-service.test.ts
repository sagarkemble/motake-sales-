import { db, eq } from "@repo/database";
import {
  billVersionsTable,
  customersTable,
  notesTable,
  paymentsTable,
  sellerSettingsTable,
  type SelectBillItem,
  type SelectCustomer,
} from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import {
  buildBill,
  buildBillVersion,
  buildCustomer,
  buildGatepass,
  buildNoteWithLines,
  buildOrder,
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
import { MemoryDocumentStore, TEST_IMAGEKIT_ID } from "../test/memory-document-store";
import { printedText } from "../test/pdf-text";
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

// Object key inside an ImageKit URL: https://ik.imagekit.io/{id}/{key}
function signedObjectKeyOf(link: string): string {
  const url = new URL(link);
  const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (parts[0] === TEST_IMAGEKIT_ID) parts.shift();
  return parts.join("/");
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
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain(bill.number);
    expect(text).toContain("Laxmi Dairy");
    expect(text).toContain(`Destination / Route ${route.name}`);
    expect(text).toContain("Dispatched through Office");
    expect(text).toContain("Maharashtra (27)");
    expect(text).toContain("Fresh Paneer 200 g");
    expect(text).toContain("₹945.00");
  });

  it("prints the GatePass salesman as Dispatched through on a field Bill", async () => {
    const { admin, customer, paneer } = await setup();
    const { profile: salesman } = await buildSalesman({ name: "Rahul Patil" });
    const gatepass = await buildGatepass({
      salesmanId: salesman.id,
      issuedBy: admin.id,
      routeId: customer.routeId,
      lines: [],
    });
    const lines = [{ variety: paneer, quantity: 2, routePricePaise: 9_000 }];
    const { order, orderItemIds } = await buildOrder({
      customer,
      actorId: salesman.id,
      salesmanId: salesman.id,
      gatepassId: gatepass.id,
      lines,
    });
    const { bill } = await buildBill({
      customer,
      actorId: salesman.id,
      orderId: order.id,
      orderItemIds,
      lines,
    });
    const [version] = await versionsOf(bill.id);

    const result = await documentsWith(new MemoryDocumentStore()).ensureBillVersionDocument(
      version!.id,
      { bytes: true },
    );

    expect(await printedText(result.bytes!)).toContain("Dispatched through Salesman: Rahul Patil");
  });

  it("prints the Seller master's phone, email, PAN, bank details and terms, and leaves out the empty ones", async () => {
    const { admin, customer, paneer } = await setup();
    const lines = [{ variety: paneer, quantity: 1, routePricePaise: 9_000 }];
    const documents = documentsWith(new MemoryDocumentStore());
    const draw = async () => {
      const { version } = await taxInvoiceOf(customer, admin.id, lines);
      const result = await documents.ensureBillVersionDocument(version.id, { bytes: true });
      return printedText(result.bytes!);
    };

    const bare = await draw();
    await db.update(sellerSettingsTable).set({
      email: "motakemilk@gmail.com",
      pan: "AAAAA0000A",
      bankName: "BANK OF INDIA",
      bankAccountNumber: "091920110000529",
      bankIfsc: "BKID0000919",
      terms: "1. Verify quantities at delivery.\n2. Refrigerate where required.",
    });
    const filled = await draw().finally(() =>
      db.update(sellerSettingsTable).set({
        email: null,
        pan: null,
        bankName: null,
        bankAccountNumber: null,
        bankIfsc: null,
        terms: null,
      }),
    );

    expect(bare).toContain("Mobile: 9800000000");
    expect(bare).not.toContain("PAN");
    expect(bare).not.toContain("Email");
    expect(bare).not.toContain("Company Bank Details");
    expect(bare).not.toContain("Terms and Conditions");
    expect(filled).toContain("Email: motakemilk@gmail.com");
    expect(filled).toContain("GSTIN/UIN: 27AAAAA0000A1Z5 | PAN: AAAAA0000A");
    expect(filled).toContain(
      "Company Bank Details Bank: BANK OF INDIA | A/c No.: 091920110000529 | IFSC: BKID0000919",
    );
    expect(filled).toContain(
      "Terms and Conditions 1. Verify quantities at delivery. 2. Refrigerate where required.",
    );
    expect(filled).toContain("For Motake Test Foods Pvt Ltd Authorised Signatory");
  });

  it("draws a Tax Invoice at once for a Customer flagged for e-invoicing, with no e-invoice block", async () => {
    const { admin, customer, paneer } = await setup({ einvoicingRequired: true });
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 1, routePricePaise: 9_000 },
    ]);

    const result = await documentsWith(new MemoryDocumentStore()).ensureBillVersionDocument(
      version.id,
      { bytes: true },
    );

    expect(result.key).toBe(`documents/bills/${bill.id}/v1.pdf`);
    expect(await pdfKeyOf(version.id)).toBe(result.key);
    const text = await printedText(result.bytes!);
    expect(text).toContain("TAX INVOICE");
    expect(text).not.toContain("E-invoice");
    expect(text).not.toContain("IRN");
  });

  it("draws a Bill of Supply for an exempt-only Bill", async () => {
    const { admin, customer, milk } = await setup();
    const { bill, version } = await taxInvoiceOf(customer, admin.id, [
      { variety: milk, quantity: 12, routePricePaise: 2_700, exempt: true },
    ]);

    const result = await documentsWith(new MemoryDocumentStore()).ensureBillVersionDocument(
      version.id,
      { bytes: true },
    );

    expect(result.key).toBe(`documents/bills/${bill.id}/v1.pdf`);
    const text = await printedText(result.bytes!);
    expect(text).toContain("BILL OF SUPPLY");
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
    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("MC/26-27/000045");
    expect(text).toContain("Laxmi Dairy");
    expect(text).not.toContain("Laxmi Dairy Renamed");
    expect(text).toContain(bill.number);
    expect(text).toContain("25/10/2026");
    expect(text).toContain("Paneer returned: seal broken");
    expect(text).not.toContain("27/10/2026");
    // The line's GST rate comes from the Bill version line it points at.
    expect(text).toContain("₹360.00 5% — ₹9.00 ₹9.00 ₹18.00");
    expect(text).toContain("Credit Note Total: ₹378.00");
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
    expect(text).toContain("CREDIT NOTE (COMMERCIAL)");
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
    expect(text).toContain("PAYMENT RECEIPT");
    expect(text).toContain("MP/26-27/000010");
    expect(text).toContain("Payment Date 25/10/2026 18:42");
    const [seller] = await db.select().from(sellerSettingsTable);
    expect(text).toContain(seller!.legalName);
    expect(text).toContain("Laxmi Dairy");
    expect(text).toContain(customer.address);
    expect(text).not.toContain(`Route: ${route.name}`);
    expect(text).toContain("AMOUNT RECEIVED ₹4,435.00");
    expect(text).toContain("₹565.00 cash returned as change");
    expect(text).toContain("Outstanding balance before receipt ₹5,685.50");
    expect(text).toContain("Outstanding balance after receipt ₹1,250.50");
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
    expect(signedObjectKeyOf(link.url)).toBe(key);
    expect(url.searchParams.get("ik-s")).toBeTruthy();
    expect(url.searchParams.get("ik-attachment")).toBe("true");
    expect(url.searchParams.get("ik-fileName")).toBe(filename);
    expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(290_000);
    expect(link.url).not.toContain("r2.dev");
  });

  it("keeps every version of a Bill downloadable", async () => {
    const { admin, customer, paneer, milk } = await setup();
    const { bill, version: v1 } = await taxInvoiceOf(customer, admin.id, [
      { variety: paneer, quantity: 3, routePricePaise: 9_000 },
    ]);
    const v2 = await buildBillVersion({
      bill,
      actorId: admin.id,
      versionNumber: 2,
      lines: [{ variety: milk, quantity: 3, routePricePaise: 2_800, gstRateBps: 500 }],
    });
    const supplyCustomer = (await setup()).customer;
    const supply = await taxInvoiceOf(supplyCustomer, admin.id, [
      { variety: milk, quantity: 12, routePricePaise: 2_700, exempt: true },
    ]);
    await buildBillVersion({
      bill: supply.bill,
      actorId: admin.id,
      versionNumber: 2,
      lines: [{ variety: milk, quantity: 10, routePricePaise: 2_700, exempt: true }],
    });
    const documents = documentsWith(new MemoryDocumentStore());

    const v1Link = await documents.getDownloadLink(admin.id, { billVersionId: v1.id });
    const v2Link = await documents.getDownloadLink(admin.id, { billVersionId: v2.id });
    const supplyV1Link = await documents.getDownloadLink(admin.id, {
      billVersionId: supply.version.id,
    });

    expect(signedObjectKeyOf(v1Link.url)).toBe(`documents/bills/${bill.id}/v1.pdf`);
    expect(signedObjectKeyOf(v2Link.url)).toBe(`documents/bills/${bill.id}/v2.pdf`);
    expect(signedObjectKeyOf(supplyV1Link.url)).toBe(`documents/bills/${supply.bill.id}/v1.pdf`);
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

    expect(signedObjectKeyOf(oldVersionLink.url)).toBe(`documents/bills/${bill.id}/v1.pdf`);
    expect(noteLink.filename).toBe("Motake Debit Note MD-26-27-000007.pdf");
    expect(signedObjectKeyOf(noteLink.url)).toBe(`documents/notes/${note.id}.pdf`);
    expect(salesmanRefusal).toEqual({ code: "FORBIDDEN", reason: "forbidden" });
  });
});
