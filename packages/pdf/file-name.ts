import type { LayoutName } from "./types";

const PAPER_BY_LAYOUT: Record<LayoutName, string> = {
  tax_invoice: "Bill",
  bill_of_supply: "Bill",
  gst_credit_note: "Credit Note",
  commercial_credit_note: "Credit Note",
  debit_note: "Debit Note",
  payment_receipt: "Receipt",
};

function safeNumber(documentNumber: string): string {
  return documentNumber.replaceAll("/", "-");
}

// `Motake Bill MB-26-27-000123.pdf`.
export function documentFileName(layout: LayoutName, documentNumber: string): string {
  return `Motake ${PAPER_BY_LAYOUT[layout]} ${safeNumber(documentNumber)}.pdf`;
}
