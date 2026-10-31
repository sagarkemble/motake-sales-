import { z } from "zod";

export const billVersionIdSchema = z.string().uuid();
export const billIdSchema = z.string().uuid();
export const noteIdSchema = z.string().uuid();

// What a draw call hands back besides the key and file name.
export const drawOptionsSchema = z
  .object({
    signedUrl: z.boolean().optional(),
    bytes: z.boolean().optional(),
  })
  .default({});
export type DrawOptions = z.input<typeof drawOptionsSchema>;

export const drawPaymentReceiptInputSchema = z.object({
  paymentId: z.string().uuid(),
  postedPaymentEventId: z.string().uuid(),
  // Signed; from the caller's Payment posted fact. The Ledger is not walked.
  balanceAfterPaise: z.number().int(),
});
export type DrawPaymentReceiptInput = z.input<typeof drawPaymentReceiptInputSchema>;

export const downloadLinkTargetSchema = z.union([
  z.object({ billVersionId: z.string().uuid() }).strict(),
  z.object({ noteId: z.string().uuid() }).strict(),
]);
export type DownloadLinkTarget = z.input<typeof downloadLinkTargetSchema>;

export interface DocumentResult {
  key: string;
  filename: string;
  signedUrl?: string;
  expiresAt?: Date;
  bytes?: Uint8Array;
}

export interface DownloadLink {
  url: string;
  filename: string;
  expiresAt: Date;
}
