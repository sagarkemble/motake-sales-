import { z } from "zod";

import { INDIAN_STATES, type IndianStateName } from "../shared/indian-states";

const indianStateNames = INDIAN_STATES.map((state) => state.name) as [
  IndianStateName,
  ...IndianStateName[],
];

// Trimmed, inner whitespace collapsed to one space.
export const cityNameSchema = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1).max(120));

export const createCityInputSchema = z.object({
  name: cityNameSchema,
  state: z.enum(indianStateNames, {
    error: "Pick the state from the list of Indian states and union territories",
  }),
});
export type CreateCityInput = z.input<typeof createCityInputSchema>;
