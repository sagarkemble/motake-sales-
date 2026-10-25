import { z } from "../../schema";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const legalTypeSchema = z.enum(["tax_invoice", "bill_of_supply"]);

// Frozen at issue and returned as stored.
export const billLetterheadSchema = z.object({
  route: z.object({ name: z.string(), code: z.string(), delivery_state: z.string() }),
  buyer: z.object({
    shop_name: z.string(),
    phone: z.string(),
    address: z.string(),
    gstin: z.string().nullable(),
  }),
  seller: z.object({ legal_name: z.string(), address: z.string(), gstin: z.string() }),
});

export const billLineSchema = z.object({
  id: z.string(),
  varietyId: z.string(),
  orderItemId: z.string().nullable(),
  stamp: z.object({ name: z.string(), unit: z.string(), hsn: z.string() }),
  quantity: z.number().int(),
  routePricePaise: z.number().int(),
  exempt: z.boolean(),
  gstRateBps: z.number().int(),
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  igstPaise: z.number().int(),
});

export const billDetailSchema = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  customerId: z.string().nullable(),
  number: z.string(),
  legalType: legalTypeSchema,
  billDate: z.string(),
  letterhead: billLetterheadSchema,
  totalQuantity: z.number().int(),
  totalPaise: z.number().int(),
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  igstPaise: z.number().int(),
  roundOffPaise: z.number().int(),
  irn: z.string().nullable(),
  irnAckNumber: z.string().nullable(),
  irnAckDate: z.string().nullable(),
  signedQrText: z.string().nullable(),
  irnRecordedAt: z.date().nullable(),
  cancelled: z.boolean(),
  items: z.array(billLineSchema),
});

export const billListRowSchema = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  number: z.string(),
  legalType: legalTypeSchema,
  billDate: z.string(),
  totalQuantity: z.number().int(),
  totalPaise: z.number().int(),
  customerId: z.string().nullable(),
  customerShopName: z.string().nullable(),
  cancelled: z.boolean(),
});

export const paginatedBillsSchema = z.object({
  items: z.array(billListRowSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const listBillsInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  salesmanId: z.string().uuid().optional(),
  billDateFrom: businessDateSchema.optional(),
  billDateTo: businessDateSchema.optional(),
  numberSearch: z.string().trim().min(1).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});

export const billIdInputSchema = z.object({ id: z.string().uuid() });

export const billNumberInputSchema = z.object({ number: z.string().trim().min(1).max(16) });

export const billOrderIdInputSchema = z.object({ orderId: z.string().uuid() });
