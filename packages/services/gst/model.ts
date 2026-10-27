import type { Gstr1FilingRow, IrnPendingRow } from "@repo/database/queries/gst";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectGstr1Filing } from "@repo/database/schema";
import { z } from "zod";

import type { CancelBillResult } from "../admin-bills/model";
import type { GstGates, IrnStatus } from "../shared/gst-gates";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD");
const reasonSchema = z.string().trim().min(1, "A reason is required").max(1000);
const notesSchema = z.string().trim().max(1000);

// `YYYY-MM`; stored as the first day of that month.
export const filingMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick the month as YYYY-MM");

const filingFieldsSchema = z.object({
  filedOn: businessDateSchema,
  reference: z
    .string()
    .trim()
    .min(1, "The GSTR-1 reference is required")
    .max(128, "The reference is at most 128 characters"),
  notes: notesSchema.nullable().optional(),
});

export const previewGstr1FilingInputSchema = z.object({ month: filingMonthSchema });
export type PreviewGstr1FilingInput = z.input<typeof previewGstr1FilingInputSchema>;

// The filer is always the signed-in Admin, never input.
export const recordGstr1FilingInputSchema = filingFieldsSchema.extend({
  month: filingMonthSchema,
});
export type RecordGstr1FilingInput = z.input<typeof recordGstr1FilingInputSchema>;

// Month and filer never change. Notes left out stay as they are; blank or null clears them.
export const correctGstr1FilingInputSchema = filingFieldsSchema.extend({
  filingId: z.string().uuid(),
  reason: reasonSchema,
});
export type CorrectGstr1FilingInput = z.input<typeof correctGstr1FilingInputSchema>;

export interface Gstr1FilingPreview {
  // `YYYY-MM`.
  month: string;
  alreadyFiled: boolean;
  billsDatedInMonth: number;
  irnPendingInMonth: number;
}

export interface RecordGstr1FilingResult {
  filing: SelectGstr1Filing;
  // A warning only: filing is never refused for it.
  irnPendingInMonth: number;
}

export type Gstr1FilingListRow = Gstr1FilingRow;

export const billIdInputSchema = z.object({ billId: z.string().uuid() });
export type BillIdInput = z.input<typeof billIdInputSchema>;

export const listIrnPendingInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});
export type ListIrnPendingInput = z.input<typeof listIrnPendingInputSchema>;
export type IrnPendingPage = PaginatedResult<IrnPendingRow>;

// --- Bill GST state (the Bill paper's GST block and every gate).

export interface BillGstState extends GstGates {
  billId: string;
  billNumber: string;
  // `YYYY-MM` of the Bill date.
  month: string;
  filedMonth: boolean;
  irnRecorded: boolean;
  cancelled: boolean;
  einvoicingApplies: boolean;
  irnPending: boolean;
  irnStatus: IrnStatus;
  irn: {
    irn: string;
    ackNumber: string | null;
    ackDate: string | null;
    signedQrText: string | null;
    hasSignedQrImage: boolean;
    recordedAt: Date | null;
    recordedByName: string | null;
    // The latest Correct IRN's reason; null when never corrected.
    correctReason: string | null;
  } | null;
  portalCancellation: { ackNumber: string; ackDate: string | null; notes: string | null } | null;
}

// --- Enter IRN and Correct IRN.

const requiredText = (label: string, max?: number) => {
  const text = z.string().trim().min(1, `${label} is required`);
  return max ? text.max(max, `${label} is at most ${max} characters`) : text;
};

// PNG or JPEG, at most 1 MB decoded (checked when it is stored). Never public.
export const signedQrImageSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg"], "The signed QR image must be a PNG or JPEG"),
  base64: z.string().min(1).max(2_000_000),
});

const irnFieldsSchema = z.object({
  billId: z.string().uuid(),
  irn: requiredText("IRN"),
  ackNumber: requiredText("Ack number", 64),
  ackDate: businessDateSchema,
  signedQrText: requiredText("Signed QR text"),
  signedQrImage: signedQrImageSchema.optional(),
});

export const enterIrnInputSchema = irnFieldsSchema;
export type EnterIrnInput = z.input<typeof enterIrnInputSchema>;

export const correctIrnInputSchema = irnFieldsSchema.extend({ reason: reasonSchema });
export type CorrectIrnInput = z.input<typeof correctIrnInputSchema>;

export interface IrnResult {
  billId: string;
  irn: string;
  ackNumber: string;
  ackDate: string;
  signedQrText: string;
  hasSignedQrImage: boolean;
  irnRecordedAt: Date;
  irnRecordedBy: string;
  irnCorrectReason: string | null;
}

// --- Portal cancellation.

export const recordPortalCancellationInputSchema = z.object({
  billId: z.string().uuid(),
  ackNumber: requiredText("Cancellation ack number", 64),
  ackDate: businessDateSchema,
  notes: notesSchema.optional(),
  reason: reasonSchema,
});
export type RecordPortalCancellationInput = z.input<typeof recordPortalCancellationInputSchema>;

export type PortalCancellationResult = CancelBillResult;

// --- Drafts.

export interface PortalJsonDraft {
  // `Motake Bill <number> DRAFT-IRN-PENDING.json`.
  filename: string;
  document: PortalJsonDocument;
}

// The government e-invoice JSON (INV-01) shape, plus Motake's draft marker. Amounts in rupees.
export interface PortalJsonDocument {
  MotakeDraft: {
    status: "DRAFT-IRN-PENDING";
    note: string;
    billId: string;
    versionNumber: number;
    // Fields the Bill does not hold; complete them on the portal.
    completeOnPortal: string[];
  };
  Version: "1.1";
  TranDtls: { TaxSch: "GST"; SupTyp: "B2B"; RegRev: "N"; IgstOnIntra: "N" };
  DocDtls: { Typ: "INV"; No: string; Dt: string };
  SellerDtls: PortalParty;
  BuyerDtls: PortalParty & { Pos: string; Ph: string };
  ItemList: PortalItem[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    RndOffAmt: number;
    TotInvVal: number;
  };
}

export interface PortalParty {
  Gstin: string;
  LglNm: string;
  Addr1: string;
  Loc: string;
  Pin: number | null;
  Stcd: string;
}

export interface PortalItem {
  SlNo: string;
  PrdDesc: string;
  IsServc: "N";
  HsnCd: string;
  Qty: number;
  Unit: string;
  UnitPrice: number;
  TotAmt: number;
  AssAmt: number;
  GstRt: number;
  CgstAmt: number;
  SgstAmt: number;
  IgstAmt: number;
  TotItemVal: number;
}

export interface DraftPdf {
  filename: string;
  contentType: "application/pdf";
  base64: string;
}
