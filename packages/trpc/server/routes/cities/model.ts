import { cityNameSchema } from "@repo/services/cities";
import { INDIAN_STATES, type IndianStateName } from "@repo/services/routes";

import { z } from "../../schema";

const indianStateNames = INDIAN_STATES.map((state) => state.name) as [
  IndianStateName,
  ...IndianStateName[],
];

export const citySchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createCityInputSchema = z.object({
  name: cityNameSchema,
  state: z.enum(indianStateNames),
});
