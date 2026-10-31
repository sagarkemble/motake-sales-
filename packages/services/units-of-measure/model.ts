import { z } from "zod";

// Trimmed, no spaces inside: "ml", "pcs", "dozen".
export const unitOfMeasureCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^\S+$/, "A unit is one word, like pcs");

export const createUnitOfMeasureInputSchema = z.object({
  code: unitOfMeasureCodeSchema,
});
export type CreateUnitOfMeasureInput = z.input<typeof createUnitOfMeasureInputSchema>;
