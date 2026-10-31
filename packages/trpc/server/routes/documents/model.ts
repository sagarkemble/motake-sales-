import { z } from "../../schema";

// Exactly one of a Bill version (latest or a history version) or a Note. Never a key.
export const downloadLinkInputSchema = z
  .object({
    billVersionId: z.string().uuid().optional(),
    noteId: z.string().uuid().optional(),
  })
  .refine(
    (input) => (input.billVersionId === undefined) !== (input.noteId === undefined),
    "Give either billVersionId or noteId",
  );

export const downloadLinkSchema = z.object({
  url: z.string(),
  filename: z.string(),
  expiresAt: z.date(),
});
