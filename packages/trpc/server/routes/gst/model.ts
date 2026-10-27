import { z } from "../../schema";

// GSTR-1 month lock and IRN capture (Spec I). Money in paise; dates `YYYY-MM-DD`; month `YYYY-MM`.

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD");
const reasonSchema = z.string().trim().min(1, "A reason is required").max(1000);
const notesSchema = z.string().trim().max(1000);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick the month as YYYY-MM");
const requiredText = (label: string, max?: number) => {
  const text = z.string().trim().min(1, `${label} is required`);
  return max ? text.max(max, `${label} is at most ${max} characters`) : text;
};

const filingFieldsSchema = z.object({
  filedOn: businessDateSchema,
  reference: requiredText("The GSTR-1 reference", 128),
  notes: notesSchema.nullable().optional(),
});

export const previewGstr1FilingInputSchema = z.object({ month: monthSchema });

// The filer is the signed-in Admin, never input.
export const recordGstr1FilingInputSchema = filingFieldsSchema.extend({ month: monthSchema });

// Month and filer never change; notes left out stay, blank clears them.
export const correctGstr1FilingInputSchema = filingFieldsSchema.extend({
  filingId: z.string().uuid(),
  reason: reasonSchema,
});

export const billIdInputSchema = z.object({ billId: z.string().uuid() });

export const listIrnPendingInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

const irnFieldsSchema = z.object({
  billId: z.string().uuid(),
  irn: requiredText("IRN"),
  ackNumber: requiredText("Ack number", 64),
  ackDate: businessDateSchema,
  signedQrText: requiredText("Signed QR text"),
  // PNG or JPEG, at most 1 MB decoded; stored privately, never public.
  signedQrImage: z
    .object({
      contentType: z.enum(["image/png", "image/jpeg"], "The signed QR image must be a PNG or JPEG"),
      base64: z.string().min(1).max(2_000_000),
    })
    .optional(),
});

export const enterIrnInputSchema = irnFieldsSchema;

export const correctIrnInputSchema = irnFieldsSchema.extend({ reason: reasonSchema });

export const recordPortalCancellationInputSchema = z.object({
  billId: z.string().uuid(),
  ackNumber: requiredText("Cancellation ack number", 64),
  ackDate: businessDateSchema,
  notes: notesSchema.optional(),
  reason: reasonSchema,
});

export const gstr1FilingSchema = z.object({
  id: z.string(),
  // First day of the month, `YYYY-MM-01`.
  periodMonth: z.string(),
  filedOn: z.string(),
  reference: z.string(),
  filerId: z.string(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const gstr1FilingListRowSchema = gstr1FilingSchema.extend({
  filerName: z.string().nullable(),
});

export const gstr1FilingPreviewSchema = z.object({
  month: z.string(),
  alreadyFiled: z.boolean(),
  billsDatedInMonth: z.number().int(),
  irnPendingInMonth: z.number().int(),
});

export const recordGstr1FilingResultSchema = z.object({
  filing: gstr1FilingSchema,
  irnPendingInMonth: z.number().int(),
});

export const irnPendingRowSchema = z.object({
  billId: z.string(),
  number: z.string(),
  customerId: z.string().nullable(),
  customerShopName: z.string().nullable(),
  routeName: z.string(),
  routeCode: z.string(),
  billDate: z.string(),
  totalPaise: z.number().int(),
  filedMonth: z.boolean(),
});

export const irnPendingPageSchema = z.object({
  items: z.array(irnPendingRowSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

const gstActionsSchema = <T extends z.ZodType>(value: T) =>
  z.object({
    lineCorrect: value,
    cancel: value,
    portalCancel: value,
    enterIrn: value,
    correctIrn: value,
    raiseNote: value,
    draft: value,
  });

export const billGstStateSchema = z.object({
  billId: z.string(),
  billNumber: z.string(),
  month: z.string(),
  filedMonth: z.boolean(),
  irnRecorded: z.boolean(),
  cancelled: z.boolean(),
  einvoicingApplies: z.boolean(),
  irnPending: z.boolean(),
  irnStatus: z.enum(["not_needed", "pending", "recorded", "portal_cancelled"]),
  irn: z
    .object({
      irn: z.string(),
      ackNumber: z.string().nullable(),
      ackDate: z.string().nullable(),
      signedQrText: z.string().nullable(),
      hasSignedQrImage: z.boolean(),
      recordedAt: z.date().nullable(),
      recordedByName: z.string().nullable(),
      correctReason: z.string().nullable(),
    })
    .nullable(),
  portalCancellation: z
    .object({ ackNumber: z.string(), ackDate: z.string().nullable(), notes: z.string().nullable() })
    .nullable(),
  allowed: gstActionsSchema(z.boolean()),
  // The refusal message for each action that is off; null when allowed.
  refusalReasons: gstActionsSchema(z.string().nullable()),
});

export const irnResultSchema = z.object({
  billId: z.string(),
  irn: z.string(),
  ackNumber: z.string(),
  ackDate: z.string(),
  signedQrText: z.string(),
  hasSignedQrImage: z.boolean(),
  irnRecordedAt: z.date(),
  irnRecordedBy: z.string(),
  irnCorrectReason: z.string().nullable(),
});

export const portalCancellationResultSchema = z.object({
  billId: z.string(),
  creditNote: z.object({
    noteId: z.string(),
    number: z.string(),
    kind: z.enum(["gst_credit_note", "commercial_credit_note", "debit_note"]),
    amountPaise: z.number().int(),
  }),
  stockRestored: z.boolean(),
  balancePaise: z.number().int(),
});

const portalPartySchema = z.object({
  Gstin: z.string(),
  LglNm: z.string(),
  Addr1: z.string(),
  Loc: z.string(),
  Pin: z.number().nullable(),
  Stcd: z.string(),
});

// The e-invoice INV-01 draft; amounts are rupees with two decimals (an export file).
export const portalJsonDraftSchema = z.object({
  filename: z.string(),
  document: z.object({
    MotakeDraft: z.object({
      status: z.literal("DRAFT-IRN-PENDING"),
      note: z.string(),
      billId: z.string(),
      versionNumber: z.number().int(),
      completeOnPortal: z.array(z.string()),
    }),
    Version: z.literal("1.1"),
    TranDtls: z.object({
      TaxSch: z.literal("GST"),
      SupTyp: z.literal("B2B"),
      RegRev: z.literal("N"),
      IgstOnIntra: z.literal("N"),
    }),
    DocDtls: z.object({ Typ: z.literal("INV"), No: z.string(), Dt: z.string() }),
    SellerDtls: portalPartySchema,
    BuyerDtls: portalPartySchema.extend({ Pos: z.string(), Ph: z.string() }),
    ItemList: z.array(
      z.object({
        SlNo: z.string(),
        PrdDesc: z.string(),
        IsServc: z.literal("N"),
        HsnCd: z.string(),
        Qty: z.number(),
        Unit: z.string(),
        UnitPrice: z.number(),
        TotAmt: z.number(),
        AssAmt: z.number(),
        GstRt: z.number(),
        CgstAmt: z.number(),
        SgstAmt: z.number(),
        IgstAmt: z.number(),
        TotItemVal: z.number(),
      }),
    ),
    ValDtls: z.object({
      AssVal: z.number(),
      CgstVal: z.number(),
      SgstVal: z.number(),
      IgstVal: z.number(),
      RndOffAmt: z.number(),
      TotInvVal: z.number(),
    }),
  }),
});

export const draftPdfSchema = z.object({
  filename: z.string(),
  contentType: z.literal("application/pdf"),
  base64: z.string(),
});
