import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";

import type {
  BillOfSupplyValues,
  CommercialCreditNoteValues,
  GstNoteValues,
  PartyBlocks,
  PaymentReceiptValues,
  SellerValues,
  TaxInvoiceLine,
  TaxInvoiceValues,
} from "./index";
import { totalQuantityText } from "./layouts/parts";
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

const seller: SellerValues = {
  legalName: "MOTAKE MILK AND MILK PRODUCTS",
  address: "Gat No 6, Motake Mala, Nandani Road, Jambhali – 416121",
  gstin: "27EHCPP4509Q1ZP",
  stateName: "Maharashtra",
  stateCode: "27",
  phone: "9822299962",
  email: "motakemilk@gmail.com",
  pan: "EHCPP4509Q",
  bank: {
    accountName: "MOTAKE MILK AND MILK PRODUCTS",
    bankName: "BANK OF INDIA",
    branch: "JAYSINGPUR",
    accountNumber: "091920110000529",
    ifsc: "BKID0000919",
  },
  terms: "1. Please verify quantities at delivery.\n2. Refrigerate where required.",
  place: "Jambhali, Maharashtra",
};

// A Seller master with none of the optional Document details filled in.
const bareSeller: SellerValues = {
  ...seller,
  email: null,
  pan: null,
  bank: null,
  terms: null,
  place: null,
};

const parties: PartyBlocks = {
  seller,
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
    salesmanName: "Rahul Patil",
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
    ...overrides,
  } as TaxInvoiceValues;
}

const pdfImageMarker = "/Subtype /Image";

// Image objects in the file: the logo is the only one.
function imageCount(bytes: Uint8Array): number {
  return Buffer.from(bytes).toString("latin1").split(pdfImageMarker).length - 1;
}

const milk: TaxInvoiceLine = {
  name: "Toned Milk 500 ml",
  unit: "pouch",
  hsn: "0401",
  quantity: 120,
  ratePaise: 2_700,
  taxablePaise: 324_000,
  gstRateBps: 0,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 0,
};

describe("tax_invoice", () => {
  it("prints the seller header, invoice box, buyer block and lines of an intra-state Bill", async () => {
    const text = await printed(await renderDocument("tax_invoice", taxInvoice()));

    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("(ORIGINAL FOR RECIPIENT)");
    expect(text).toContain("MOTAKE MILK AND MILK PRODUCTS");
    expect(text).toContain("Mobile: 9822299962");
    expect(text).toContain("Email: motakemilk@gmail.com");
    expect(text).toContain("GSTIN/UIN: 27EHCPP4509Q1ZP | PAN: EHCPP4509Q");
    expect(text).toContain("Invoice No. MB/26-27/000123");
    expect(text).toContain("Dated 25/10/2026");
    expect(text).toContain("Dispatched through Salesman: Rahul Patil");
    expect(text).toContain("Destination / Route Kolhapur City");
    expect(text).not.toContain("Reverse Charge");
    expect(text).toContain("Laxmi Dairy");
    expect(text).toContain("GSTIN/UIN: 27ABCDE1234F1Z5");
    expect(text).toContain("State Name: Maharashtra, Code: 27 | Mobile: 9823012345");
    expect(text).toContain("Place of Supply Maharashtra (27)");
    expect(text).toContain("Contact 9823012345");
    expect(text).toContain("Delivery Note Date 25/10/2026");
    // Sl, description, HSN, rate excl. GST, GST %, rate incl. GST, qty, unit, amount.
    expect(text).toContain("1 Fresh Paneer 200 g 0406 ₹90.00 5% ₹94.50 10 pack ₹945.00");
    expect(text).toContain("Total Quantity: 10 pack");
    expect(text).toContain("Round Off: -₹0.50");
    expect(text).toContain("Grand Total: ₹944.50");
    expect(text).toContain("Rupees Nine Hundred Forty Four and Fifty Paise Only");
    expect(text).not.toContain("Version");
  });

  it("groups the GST summary by rate, with CGST and SGST filled and IGST dashed intra-state", async () => {
    const values = taxInvoice({
      lines: [milk, paneer],
      totals: {
        taxablePaise: 414_000,
        cgstPaise: 2_250,
        sgstPaise: 2_250,
        igstPaise: 0,
        roundOffPaise: 0,
        totalPaise: 418_500,
      },
    });

    const text = await printed(await renderDocument("tax_invoice", values));

    expect(text).toContain("GST SUMMARY Taxable Value");
    expect(text).toContain("Taxable Value GST Rate IGST CGST SGST Total Tax");
    expect(text).toContain("₹3,240.00 0% — ₹0.00 ₹0.00 ₹0.00");
    expect(text).toContain("₹900.00 5% — ₹22.50 ₹22.50 ₹45.00");
    expect(text).toContain("₹4,140.00 Total — ₹22.50 ₹22.50 ₹45.00");
    expect(text).toContain("Tax Amount (in words): Rupees Forty Five Only");
    expect(text).toContain("Total Quantity: 130 (mixed units)");
  });

  it("prints an inter-state Bill with IGST filled and CGST and SGST dashed", async () => {
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

    expect(text).toContain("GST SUMMARY Taxable Value");
    expect(text).toContain("₹900.00 5% ₹45.00 — — ₹45.00");
    expect(text).toContain("Place of Supply Karnataka (29)");
    expect(text).toContain("State Name: Karnataka, Code: 29");
  });

  it("prints Office as Dispatched through on an Admin-raised Bill", async () => {
    const text = await printed(
      await renderDocument("tax_invoice", taxInvoice({ salesmanName: null })),
    );

    expect(text).toContain("Dispatched through Office");
    expect(text).not.toContain("Salesman:");
  });

  it("prints the bank details, the terms one per line and the signatory for the seller", async () => {
    const text = await printed(await renderDocument("tax_invoice", taxInvoice()));

    expect(text).toContain(
      "Company Bank Details Firm Name: MOTAKE MILK AND MILK PRODUCTS | Bank: BANK OF INDIA | Branch: JAYSINGPUR | A/c No.: 091920110000529 | IFSC: BKID0000919",
    );
    expect(text).toContain(
      "Terms and Conditions 1. Please verify quantities at delivery. 2. Refrigerate where required.",
    );
    expect(text).toContain("For MOTAKE MILK AND MILK PRODUCTS Authorised Signatory");
  });

  it("leaves out the email, PAN, bank block and terms while the Seller master has none", async () => {
    const text = await printed(
      await renderDocument(
        "tax_invoice",
        taxInvoice({ seller: bareSeller, salesmanName: null } as Partial<TaxInvoiceValues>),
      ),
    );

    expect(text).toContain("GSTIN/UIN: 27EHCPP4509Q1ZP");
    expect(text).not.toContain("PAN");
    expect(text).not.toContain("Email");
    expect(text).not.toContain("Company Bank Details");
    expect(text).not.toContain("Terms and Conditions");
    expect(text).toContain("For MOTAKE MILK AND MILK PRODUCTS Authorised Signatory");
  });

  it("prints only the bank fields that are set", async () => {
    const values = taxInvoice({
      seller: {
        ...seller,
        bank: {
          accountName: null,
          bankName: "BANK OF INDIA",
          branch: null,
          accountNumber: "091920110000529",
          ifsc: null,
        },
      },
    });

    const text = await printed(await renderDocument("tax_invoice", values));

    expect(text).toContain("Bank: BANK OF INDIA | A/c No.: 091920110000529");
    expect(text).not.toContain("Branch:");
    expect(text).not.toContain("IFSC:");
  });

  it("prints a Marathi buyer name, address and Route next to Latin text and ₹", async () => {
    const values = taxInvoice({
      buyer: {
        ...parties.buyer,
        shopName: "श्री गणेश Traders",
        address: "ज्ञानेश्वर नगर, कोल्हापूर",
      },
      route: { name: "कोल्हापूर शहर", code: "rt-kolhapur-city-001" },
    });

    const text = await printed(await renderDocument("tax_invoice", values));

    // Text extraction reads glyphs in drawn order, so a pre-base matra (ि) or a reph would come
    // back moved (these words have neither), and it puts a space after a conjunct glyph
    // ("श्र ी"), so whole names are checked with spaces removed.
    expect(text).toContain("गणेश Traders");
    expect(text).toContain("नगर, कोल्हापूर");
    expect(text).toContain("Destination / Route कोल्हापूर शहर");
    const unspaced = text.replaceAll(" ", "");
    expect(unspaced).toContain("श्रीगणेशTraders");
    expect(unspaced).toContain("ज्ञानेश्वरनगर,कोल्हापूर");
    expect(text).toContain("₹944.50");
  });

  it("prints Unregistered for a buyer without GSTIN, and Version 2 on a corrected Bill", async () => {
    const values = taxInvoice({ buyer: { ...parties.buyer, gstin: null }, versionNumber: 2 });

    const text = await printed(await renderDocument("tax_invoice", values));

    expect(text).toContain("GSTIN/UIN: Unregistered");
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

  it("repeats the line header and the page count on every page of a long Bill", async () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({
      ...paneer,
      name: `Variety ${index + 1}`,
    }));
    const values = taxInvoice({ lines });

    const bytes = await renderDocument("tax_invoice", values);
    const pages = await printedPages(bytes);

    expect(pages.length).toBeGreaterThan(1);
    for (const [index, page] of pages.entries()) {
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
      // Column headings only the repeated line header prints, on every page that carries lines.
      if (page.includes("Variety")) {
        expect(page).toContain("HSN");
        expect(page).toContain("GST %");
      }
    }
    expect(pages[1]).toContain("Tax Invoice MB/26-27/000123 (continued)");
    expect(imageCount(bytes)).toBe(1);
  });

  it("prints the logo and the computer generated line with the page count", async () => {
    const bytes = await renderDocument("tax_invoice", taxInvoice());
    const text = await printed(bytes);

    expect(text).toContain("This is a computer generated document.");
    expect(text).toContain("Page 1 of 1");
    expect(imageCount(bytes)).toBe(1);
  });
});

describe("bill_of_supply", () => {
  it("prints no tax columns or GST summary and says it is an exempt supply", async () => {
    const values: BillOfSupplyValues = {
      ...parties,
      billNumber: "MB/26-27/000124",
      billDate: "2026-10-25",
      versionNumber: 1,
      salesmanName: null,
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

    expect(text).toContain("BILL OF SUPPLY");
    expect(text).toContain("Dispatched through Office");
    expect(text).toContain("1 Toned Milk 500 ml 0401 ₹27.00 120 pouch ₹3,240.00");
    expect(text).toContain("Grand Total: ₹3,240.00");
    expect(text).toContain("Exempt supply. No tax charged.");
    expect(text).toContain("Company Bank Details");
    expect(text).not.toMatch(/CGST|SGST|IGST|GST %|GST SUMMARY/);
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
        gstRateBps: 500,
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
  it("prints the original Bill, the reason, the lines and the tax reversed, without a return date", async () => {
    const text = await printed(await renderDocument("gst_credit_note", gstNote()));

    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("Document No. MC/26-27/000045");
    expect(text).toContain("Date 28/10/2026");
    expect(text).toContain("Place Jambhali, Maharashtra");
    expect(text).toContain("GSTIN: 27ABCDE1234F1Z5 | Mobile: 9823012345");
    expect(text).toContain("Place of Supply Maharashtra (27)");
    expect(text).toContain("Original Invoice No. MB/26-27/000123");
    expect(text).toContain("Original Invoice Date 25/10/2026");
    expect(text).not.toContain("Return / damage date");
    expect(text).toContain("Reason for Credit Note Paneer returned: seal broken");
    expect(text).toContain("1 Fresh Paneer 200 g 0406 ₹90.00 5% 4 pack ₹360.00 ₹378.00");
    expect(text).toContain("₹360.00 5% — ₹9.00 ₹9.00 ₹18.00");
    expect(text).toContain("Credit Note Total: ₹378.00");
    expect(text).toContain("Rupees Three Hundred Seventy Eight Only");
    expect(text).toContain("Company Bank Details");
  });

  it("prints a Debit Note with its extra tax and no return date when none is set", async () => {
    const text = await printed(
      await renderDocument(
        "debit_note",
        gstNote({ noteNumber: "MD/26-27/000007", returnOrDamageOn: null, reason: "Undercharged" }),
      ),
    );

    expect(text).toContain("DEBIT NOTE");
    expect(text).toContain("MD/26-27/000007");
    expect(text).toContain("Reason for Debit Note Undercharged");
    expect(text).toContain("MB/26-27/000123");
    expect(text).toContain("Debit Note Total: ₹378.00");
    expect(text).not.toContain("Return / damage date");
  });

  it("leaves out the place, bank block and terms while the Seller master has none", async () => {
    const text = await printed(
      await renderDocument("gst_credit_note", gstNote({ seller: bareSeller })),
    );

    expect(text).not.toContain("Place Jambhali");
    expect(text).not.toContain("Company Bank Details");
    expect(text).not.toContain("Terms and Conditions");
    expect(text).toContain("Authorised Signatory");
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

    expect(text).toContain("CREDIT NOTE (COMMERCIAL)");
    expect(text).toContain("This Credit Note does not reduce GST. Not a GST Credit Note.");
    expect(text).toContain("1 Cow Ghee 1 L 0405 2 tin ₹138.88");
    expect(text).toContain("Round Off: +₹0.12");
    expect(text).toContain("Credit Note Total: ₹139.00");
    expect(text).not.toMatch(/CGST|SGST|IGST|GST SUMMARY/);
  });
});

function receipt(overrides: Partial<PaymentReceiptValues> = {}): PaymentReceiptValues {
  return {
    seller: parties.seller,
    customer: { shopName: "Laxmi Dairy", phone: "9823012345", address: "Rajarampuri, Kolhapur" },
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
  it("prints the amount kept, the account summary as Outstanding and the cash returned in remarks", async () => {
    const text = await printed(await renderDocument("payment_receipt", receipt()));

    expect(text).toContain("PAYMENT RECEIPT");
    expect(text).toContain("Receipt No. MP/26-27/000010");
    expect(text).toContain("Receipt Date 25/10/2026");
    expect(text).toContain("Received At Jambhali, Maharashtra");
    expect(text).toContain("RECEIVED FROM Laxmi Dairy Rajarampuri, Kolhapur Mobile: 9823012345");
    expect(text).not.toContain("Route: Kolhapur City");
    expect(text).toContain("Mode Cash");
    expect(text).toContain("Payment Date 25/10/2026 18:42");
    expect(text).not.toContain("Reference");
    expect(text).toContain("AMOUNT RECEIVED ₹4,435.00");
    expect(text).toContain("Rupees Four Thousand Four Hundred Thirty Five Only");
    expect(text).toContain("Outstanding balance before receipt ₹5,685.50");
    expect(text).toContain("Less: Payment received ₹4,435.00");
    expect(text).toContain("Outstanding balance after receipt ₹1,250.50");
    expect(text).toContain("₹5,000.00 handed over; ₹565.00 cash returned as change.");
    expect(text).not.toContain("This is not a tax invoice.");
    expect(text).toContain("Company Bank Details");
  });

  it("words a negative balance as Advance, prints the reference and no cash returned", async () => {
    const text = await printed(
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

    expect(text).toContain("Mode UPI");
    expect(text).toContain("Reference UPI-4471");
    expect(text).toContain("Outstanding balance before receipt ₹4,235.00");
    expect(text).toContain("Advance balance after receipt ₹200.00");
    expect(text).not.toContain("cash returned");
    expect(text).toContain("no specific invoice allocation");
  });

  it("words the balance before as Advance when the Customer was already ahead", async () => {
    const text = await printed(
      await renderDocument(
        "payment_receipt",
        receipt({ returnedPaise: 0, keptPaise: 10_000, balanceAfterPaise: -30_000 }),
      ),
    );

    expect(text).toContain("Advance balance before receipt ₹200.00");
    expect(text).toContain("Advance balance after receipt ₹300.00");
  });

  it("leaves out Received At and the bank block while the Seller master has none", async () => {
    const text = await printed(
      await renderDocument("payment_receipt", receipt({ seller: bareSeller })),
    );

    expect(text).not.toContain("Received At");
    expect(text).not.toContain("Company Bank Details");
    expect(text).toContain("For MOTAKE MILK AND MILK PRODUCTS Authorised Signatory");
  });
});

describe("totalQuantityText", () => {
  it("names the one unit, says mixed for several, and is just the number for sized names", () => {
    expect(totalQuantityText([{ quantity: 20, unit: "L" }])).toBe("20 L");
    expect(
      totalQuantityText([
        { quantity: 3, unit: "pouch" },
        { quantity: 4, unit: "cup" },
      ]),
    ).toBe("7 (mixed units)");
    expect(
      totalQuantityText([
        { quantity: 3, unit: "" },
        { quantity: 4, unit: "" },
      ]),
    ).toBe("7");
  });
});
