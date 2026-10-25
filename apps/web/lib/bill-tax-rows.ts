type BillTax = "cgst" | "sgst" | "igst";

interface BillTaxFigures {
  legalType: "tax_invoice" | "bill_of_supply";
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * The tax rows a Bill's totals show: CGST and SGST, or IGST when inter-state.
 * A Bill of Supply charges no GST, so it shows none.
 */
export function billTaxRows(bill: BillTaxFigures): { tax: BillTax; paise: number }[] {
  if (bill.legalType !== "tax_invoice") return [];
  if (bill.igstPaise > 0) return [{ tax: "igst", paise: bill.igstPaise }];
  return [
    { tax: "cgst", paise: bill.cgstPaise },
    { tax: "sgst", paise: bill.sgstPaise },
  ];
}
