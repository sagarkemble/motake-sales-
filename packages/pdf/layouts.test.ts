import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";

import type {
  BillOfSupplyValues,
  CommercialCreditNoteValues,
  GstNoteValues,
  PartyBlocks,
  PaymentReceiptValues,
  TaxInvoiceLine,
  TaxInvoiceValues,
} from "./index";
import { renderDocument } from "./render";

// The text a reader sees, one string per page, with line wraps read as spaces.
async function printedPages(bytes: Uint8Array): Promise<string[]> {
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(document, { mergePages: false });
  return text.map((page) => page.replace(/\s+/g, " "));
}

async function printed(bytes: Uint8Array): Promise<string> {
  return (await printedPages(bytes)).join("\n");
}

const parties: PartyBlocks = {
  seller: {
    legalName: "MOTAKE MILK AND MILK PRODUCT",
    address: "GAT NO 6, MOTAKE MALA, NANDANI ROAD, JAMBHALI-416121",
    gstin: "27EHCPP4509Q1ZP",
    stateName: "Maharashtra",
    stateCode: "27",
  },
  buyer: {
    shopName: "Laxmi Dairy",
    phone: "9823012345",
    address: "Rajarampuri, Kolhapur",
    gstin: "27ABCDE1234F1Z5",
  },
  route: { name: "Kolhapur City", code: "rt-kolhapur-city-001" },
  placeOfSupply: { stateName: "Maharashtra", stateCode: "27" },
};

const paneer: TaxInvoiceLine = {
  name: "Fresh Paneer 200 g",
  unit: "pack",
  hsn: "0406",
  quantity: 10,
  ratePaise: 9_000,
  taxablePaise: 90_000,
  gstRateBps: 500,
  cgstPaise: 2_250,
  sgstPaise: 2_250,
  igstPaise: 0,
};

function taxInvoice(overrides: Partial<TaxInvoiceValues> = {}): TaxInvoiceValues {
  return {
    ...parties,
    billNumber: "MB/26-27/000123",
    billDate: "2026-10-25",
    versionNumber: 1,
    supplyType: "intra_state",
    lines: [paneer],
    totals: {
      taxablePaise: 90_000,
      cgstPaise: 2_250,
      sgstPaise: 2_250,
      igstPaise: 0,
      roundOffPaise: -50,
      totalPaise: 94_450,
    },
    draft: false,
    irn: null,
    ...overrides,
  } as TaxInvoiceValues;
}

const pdfImageMarker = "/Subtype /Image";

describe("tax_invoice", () => {
  it("prints an intra-state Bill with CGST and SGST, the signed round-off and the total in words", async () => {
    const text = await printed(await renderDocument("tax_invoice", taxInvoice()));

    expect(text).toContain("Tax Invoice");
    expect(text).toContain("MOTAKE MILK AND MILK PRODUCT");
    expect(text).toContain("27EHCPP4509Q1ZP");
    expect(text).toContain("Maharashtra (27)");
    expect(text).toContain("Laxmi Dairy");
    expect(text).toContain("27ABCDE1234F1Z5");
    expect(text).toContain("Kolhapur City (rt-kolhapur-city-001)");
    expect(text).toContain("Intra-state");
    expect(text).toContain("MB/26-27/000123");
    expect(text).toContain("25/10/2026");
    expect(text).toContain("Fresh Paneer 200 g");
    expect(text).toContain("0406");
    expect(text).toContain("₹900.00");
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
    expect(text).not.toContain("IGST");
    expect(text).toContain("-₹0.50");
    expect(text).toContain("₹944.50");
    expect(text).toContain("Rupees Nine Hundred Forty Four and Fifty Paise Only");
    expect(text).toContain("Reverse charge:");
    expect(text).not.toContain("Version");
  });

  it("prints an inter-state Bill with IGST only", async () => {
    const igstLine = { ...paneer, cgstPaise: 0, sgstPaise: 0, igstPaise: 4_500 };
    const values = taxInvoice({
      supplyType: "inter_state",
      placeOfSupply: { stateName: "Karnataka", stateCode: "29" },
      lines: [igstLine],
      totals: {
        taxablePaise: 90_000,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 4_500,
        roundOffPaise: 0,
        totalPaise: 94_500,
      },
    });

    const text = await printed(await renderDocument("tax_invoice", values));

    expect(text).toContain("IGST");
    expect(text).toContain("₹45.00");
    expect(text).toContain("Inter-state");
    expect(text).toContain("Karnataka (29)");
    expect(text).not.toContain("CGST");
    expect(text).not.toContain("SGST");
  });

  it("prints Unregistered for a buyer without GSTIN, and Version 2 on a corrected Bill", async () => {
    const values = taxInvoice({ buyer: { ...parties.buyer, gstin: null }, versionNumber: 2 });

    const text = await printed(await renderDocument("tax_invoice", values));

    expect(text).toContain("Unregistered");
    expect(text).toContain("Version");
    expect(text).toMatch(/Version\s*2/);
  });

  it("writes totals across lakh and crore in words", async () => {
    const values = taxInvoice({
      totals: { ...taxInvoice().totals, totalPaise: 1_234_567_890 },
    });

    const text = await printed(await renderDocument("tax_invoice", values));

    expect(text).toContain("₹1,23,45,678.90");
    expect(text).toContain(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Paise Only",
    );
  });

  it("prints the IRN block with a QR image when the IRN is recorded", async () => {
    const values = taxInvoice({
      irn: {
        irn: "8f3a2c9b5e1d47f0a6b3c2d1e0f9a8b7",
        ackNumber: "112610250012345",
        ackDate: "2026-10-26",
        signedQrText: "eyJhbGciOiJSUzI1NiJ9.signed-qr-payload.signature",
      },
    });

    const bytes = await renderDocument("tax_invoice", values);
    const text = await printed(bytes);

    expect(text).toContain("8f3a2c9b5e1d47f0a6b3c2d1e0f9a8b7");
    expect(text).toContain("112610250012345");
    expect(text).toContain("26/10/2026");
    expect(Buffer.from(bytes).toString("latin1")).toContain(pdfImageMarker);
  });

  it("prints Draft — IRN pending on every page of a long draft and no IRN block", async () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({
      ...paneer,
      name: `Variety ${index + 1}`,
    }));
    const values = taxInvoice({ lines, draft: true, irn: null });

    const bytes = await renderDocument("tax_invoice", values);
    const pages = await printedPages(bytes);

    expect(pages.length).toBeGreaterThan(1);
    for (const [index, page] of pages.entries()) {
      expect(page).toContain("Draft — IRN pending");
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
      expect(page).toContain("Taxable");
    }
    expect(pages.join("\n")).not.toContain("Ack No.");
    expect(Buffer.from(bytes).toString("latin1")).not.toContain(pdfImageMarker);
  });

  it("refuses a draft that carries an IRN", async () => {
    const values = {
      ...taxInvoice(),
      draft: true,
      irn: { irn: "x", ackNumber: "1", ackDate: "2026-10-26", signedQrText: "q" },
    } as unknown as TaxInvoiceValues;

    await expect(renderDocument("tax_invoice", values)).rejects.toThrow(/cannot carry an IRN/);
  });

  it("prints the computer generated line and the signatory on every page", async () => {
    const text = await printed(await renderDocument("tax_invoice", taxInvoice()));

    expect(text).toContain("This is a computer generated document.");
    expect(text).toContain("Authorised signatory, for MOTAKE MILK AND MILK PRODUCT");
    expect(text).toContain("Page 1 of 1");
  });
});

describe("bill_of_supply", () => {
  it("prints no tax columns and says it is an exempt supply", async () => {
    const values: BillOfSupplyValues = {
      ...parties,
      billNumber: "MB/26-27/000124",
      billDate: "2026-10-25",
      versionNumber: 1,
      lines: [
        {
          name: "Toned Milk 500 ml",
          unit: "pouch",
          hsn: "0401",
          quantity: 120,
          ratePaise: 2_700,
          valuePaise: 324_000,
        },
      ],
      totals: { roundOffPaise: 0, totalPaise: 324_000 },
    };

    const text = await printed(await renderDocument("bill_of_supply", values));

    expect(text).toContain("Bill of Supply");
    expect(text).toContain("Exempt supply. No tax charged.");
    expect(text).toContain("₹3,240.00");
    expect(text).not.toMatch(/CGST|SGST|IGST|GST %/);
  });
});

function gstNote(overrides: Partial<GstNoteValues> = {}): GstNoteValues {
  return {
    ...parties,
    noteNumber: "MC/26-27/000045",
    issuedOn: "2026-10-28",
    reason: "Paneer returned: seal broken",
    returnOrDamageOn: "2026-10-27",
    originalBill: { number: "MB/26-27/000123", date: "2026-10-25" },
    supplyType: "intra_state",
    lines: [
      {
        name: "Fresh Paneer 200 g",
        unit: "pack",
        hsn: "0406",
        quantity: 4,
        taxablePaise: 36_000,
        cgstPaise: 900,
        sgstPaise: 900,
        igstPaise: 0,
      },
    ],
    totals: {
      taxablePaise: 36_000,
      cgstPaise: 900,
      sgstPaise: 900,
      igstPaise: 0,
      roundOffPaise: 0,
      totalPaise: 37_800,
    },
    ...overrides,
  };
}

describe("gst_credit_note and debit_note", () => {
  it("prints the original Bill, the reason, the return date and the tax reversed", async () => {
    const text = await printed(await renderDocument("gst_credit_note", gstNote()));

    expect(text).toContain("Credit Note");
    expect(text).toContain("MC/26-27/000045");
    expect(text).toContain("28/10/2026");
    expect(text).toContain("MB/26-27/000123");
    expect(text).toContain("25/10/2026");
    expect(text).toContain("Paneer returned: seal broken");
    expect(text).toContain("Return / damage date:");
    expect(text).toContain("27/10/2026");
    expect(text).toContain("CGST");
    expect(text).toContain("₹9.00");
    expect(text).toContain("₹378.00");
  });

  it("prints a Debit Note with its extra tax and no return date when none is set", async () => {
    const text = await printed(
      await renderDocument(
        "debit_note",
        gstNote({ noteNumber: "MD/26-27/000007", returnOrDamageOn: null, reason: "Undercharged" }),
      ),
    );

    expect(text).toContain("Debit Note");
    expect(text).toContain("MD/26-27/000007");
    expect(text).toContain("Undercharged");
    expect(text).toContain("MB/26-27/000123");
    expect(text).toContain("₹9.00");
    expect(text).not.toContain("Return / damage date");
  });

  it("prints a Commercial Credit Note with no tax and the does-not-reduce-GST line", async () => {
    const values: CommercialCreditNoteValues = {
      ...parties,
      noteNumber: "MC/26-27/000046",
      issuedOn: "2027-12-05",
      reason: "Late discount",
      returnOrDamageOn: null,
      originalBill: { number: "MB/26-27/000123", date: "2026-10-25" },
      lines: [{ name: "Cow Ghee 1 L", unit: "tin", hsn: "0405", quantity: 2, amountPaise: 13_888 }],
      totals: { roundOffPaise: 12, totalPaise: 13_900 },
    };

    const text = await printed(await renderDocument("commercial_credit_note", values));

    expect(text).toContain("Credit Note (Commercial)");
    expect(text).toContain("This Credit Note does not reduce GST. Not a GST Credit Note.");
    expect(text).toContain("₹138.88");
    expect(text).toContain("+₹0.12");
    expect(text).not.toMatch(/CGST|SGST|IGST/);
  });
});

function receipt(overrides: Partial<PaymentReceiptValues> = {}): PaymentReceiptValues {
  return {
    seller: parties.seller,
    customer: { shopName: "Laxmi Dairy", phone: "9823012345" },
    route: parties.route,
    receiptNumber: "MP/26-27/000010",
    paidOn: "2026-10-25",
    paidAtTime: "18:42",
    mode: "cash",
    reference: null,
    receivedPaise: 500_000,
    keptPaise: 443_500,
    returnedPaise: 56_500,
    balanceAfterPaise: 125_050,
    ...overrides,
  };
}

describe("payment_receipt", () => {
  it("prints kept, cash returned and the Balance after as Pending", async () => {
    const text = await printed(await renderDocument("payment_receipt", receipt()));

    expect(text).toContain("Payment Receipt");
    expect(text).toContain("MP/26-27/000010");
    expect(text).toContain("25/10/2026 18:42");
    expect(text).toContain("Cash");
    expect(text).toContain("₹4,435.00");
    expect(text).toContain("Cash returned");
    expect(text).toContain("₹565.00");
    expect(text).toContain("Pending ₹1,250.50");
    expect(text).toContain("This is not a tax invoice.");
    expect(text).toContain("Kolhapur City (rt-kolhapur-city-001)");
  });

  it("leaves out cash returned when nothing was returned, and words Advance and Settled", async () => {
    const advance = await printed(
      await renderDocument(
        "payment_receipt",
        receipt({
          mode: "upi",
          reference: "UPI-4471",
          receivedPaise: 443_500,
          returnedPaise: 0,
          balanceAfterPaise: -20_000,
        }),
      ),
    );
    const settled = await printed(
      await renderDocument("payment_receipt", receipt({ balanceAfterPaise: 0 })),
    );

    expect(advance).not.toContain("Cash returned");
    expect(advance).toContain("UPI-4471");
    expect(advance).toContain("Advance ₹200.00");
    expect(settled).toContain("Settled");
  });
});
