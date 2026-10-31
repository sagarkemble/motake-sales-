import { unitOfMeasureCodeSchema } from "@repo/services/units-of-measure";

import { z } from "../../schema";

export const unitOfMeasureSchema = z.object({
  id: z.string(),
  code: z.string(),
  // Null for ml, L, g and kg, which the migration seeds.
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUnitOfMeasureInputSchema = z.object({
  code: unitOfMeasureCodeSchema,
});
