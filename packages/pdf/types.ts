// The six fixed Document layouts and the values each one prints. Money is integer paise, dates are
// `YYYY-MM-DD` (Asia/Kolkata). A missing GSTIN or IRN field is a type error here, not a blank on
// the paper.

export const LAYOUT_NAMES = [
  "tax_invoice",
  "bill_of_supply",
  "gst_credit_note",
  "commercial_credit_note",
  "debit_note",
  "payment_receipt",
] as const;
export type LayoutName = (typeof LAYOUT_NAMES)[number];

export type SupplyType = "intra_state" | "inter_state";

// Account name, bank, branch, account number and IFSC; each may be empty on its own.
export interface BankValues {
  accountName: string | null;
  bankName: string | null;
  branch: string | null;
  accountNumber: string | null;
  ifsc: string | null;
}

export interface SellerValues {
  legalName: string;
  address: string;
  gstin: string;
  stateName: string;
  // Two-digit GST state code.
  stateCode: string;
  phone: string;
  email: string | null;
  // The paper leaves out each of these while it is empty.
  pan: string | null;
  bank: BankValues | null;
  // One term per line.
  terms: string | null;
  // "Received At" on a receipt, "Place" on a Note.
  place: string | null;
}

export interface BuyerValues {
  shopName: string;
  phone: string;
  address: string;
  // Null prints "Unregistered".
  gstin: string | null;
}

export interface RouteValues {
  name: string;
  code: string;
}

export interface PlaceOfSupplyValues {
  stateName: string;
  stateCode: string;
}

// The blocks every Bill and Note paper prints above its lines.
export interface PartyBlocks {
  seller: SellerValues;
  buyer: BuyerValues;
  route: RouteValues;
  placeOfSupply: PlaceOfSupplyValues;
}

export interface BillHeaderValues extends PartyBlocks {
  billNumber: string;
  billDate: string;
  // Printed as "Version n" only when n > 1.
  versionNumber: number;
  // Dispatched through: the salesman of a field Bill; null prints "Office".
  salesmanName: string | null;
}

export interface TaxInvoiceLine {
  name: string;
  unit: string;
  hsn: string;
  quantity: number;
  // The Route price, tax-exclusive.
  ratePaise: number;
  taxablePaise: number;
  gstRateBps: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface TaxInvoiceTotals {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  // Signed.
  roundOffPaise: number;
  totalPaise: number;
}

export interface IrnValues {
  irn: string;
  ackNumber: string;
  ackDate: string;
  // The portal's signed QR text; the module draws the QR from it.
  signedQrText: string;
}

interface TaxInvoiceBase extends BillHeaderValues {
  supplyType: SupplyType;
  lines: TaxInvoiceLine[];
  totals: TaxInvoiceTotals;
}

// A draft never carries an IRN: it is the Admin's check copy while the IRN is pending.
export type TaxInvoiceValues = TaxInvoiceBase &
  ({ draft: true; irn: null } | { draft: false; irn: IrnValues | null });

export interface BillOfSupplyLine {
  name: string;
  unit: string;
  hsn: string;
  quantity: number;
  ratePaise: number;
  valuePaise: number;
}

export interface BillOfSupplyValues extends BillHeaderValues {
  lines: BillOfSupplyLine[];
  totals: { roundOffPaise: number; totalPaise: number };
}

export interface NoteHeaderValues extends PartyBlocks {
  noteNumber: string;
  issuedOn: string;
  reason: string;
  returnOrDamageOn: string | null;
  originalBill: { number: string; date: string };
}

export interface GstNoteLine {
  name: string;
  unit: string;
  hsn: string;
  quantity: number;
  // The Bill line's rate; the GST summary groups by it.
  gstRateBps: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface GstNoteValues extends NoteHeaderValues {
  supplyType: SupplyType;
  lines: GstNoteLine[];
  totals: TaxInvoiceTotals;
}

export type GstCreditNoteValues = GstNoteValues;
export type DebitNoteValues = GstNoteValues;

export interface CommercialNoteLine {
  name: string;
  unit: string;
  hsn: string;
  quantity: number;
  // Tax-inclusive value.
  amountPaise: number;
}

export interface CommercialCreditNoteValues extends NoteHeaderValues {
  lines: CommercialNoteLine[];
  totals: { roundOffPaise: number; totalPaise: number };
}

export type PaymentModeValue = "cash" | "bank" | "upi";

export interface PaymentReceiptValues {
  seller: SellerValues;
  customer: { shopName: string; phone: string; address: string };
  route: RouteValues;
  receiptNumber: string;
  paidOn: string;
  // `HH:mm`, Asia/Kolkata.
  paidAtTime: string;
  mode: PaymentModeValue;
  reference: string | null;
  receivedPaise: number;
  keptPaise: number;
  // Printed only when above ₹0.
  returnedPaise: number;
  // Signed: above zero Pending, below zero Advance, zero Settled. The balance before is this plus
  // the kept amount.
  balanceAfterPaise: number;
}

export interface LayoutValues {
  tax_invoice: TaxInvoiceValues;
  bill_of_supply: BillOfSupplyValues;
  gst_credit_note: GstCreditNoteValues;
  commercial_credit_note: CommercialCreditNoteValues;
  debit_note: DebitNoteValues;
  payment_receipt: PaymentReceiptValues;
}
